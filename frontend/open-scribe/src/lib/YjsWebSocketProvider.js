/**
 * YjsWebSocketProvider
 *
 * A custom WebSocket provider that implements the y-websocket binary protocol
 * and connects to our Django Channels backend.
 *
 * Protocol (first byte of each binary message):
 *   0  sync-step-1  : send local state vector → server replies with missing updates
 *   1  sync-step-2  : receive server state (apply to local Y.Doc)
 *   2  update       : incremental update from a peer (apply to local Y.Doc)
 *   3  awareness    : cursor/selection/presence update
 *
 * Features:
 *   - Automatic reconnect with exponential back-off (max 30 s)
 *   - Token refresh: reads the latest access_token from localStorage on each
 *     reconnect attempt so a silently-refreshed token is always used
 *   - Awareness (remote cursors) synced in both directions
 */

import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";
import * as syncProtocol from "y-protocols/sync";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";

const MSG_SYNC_STEP_1 = 0;
const MSG_SYNC_STEP_2 = 1;
const MSG_UPDATE = 2;
const MSG_AWARENESS = 3;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class YjsWebSocketProvider {
  /**
   * @param {string}    wsUrl         Full WebSocket URL (without token — added here)
   * @param {Y.Doc}     ydoc
   * @param {import('y-protocols/awareness').Awareness} awareness
   * @param {{ onStatusChange?: Function, onPeersChange?: Function }} opts
   */
  constructor(wsUrl, ydoc, awareness, opts = {}) {
    this._wsUrlBase = wsUrl; // may already contain ?token=…
    this._ydoc = ydoc;
    this._awareness = awareness;
    this._onStatusChange = opts.onStatusChange || (() => {});
    this._onPeersChange = opts.onPeersChange || (() => {});

    this._ws = null;
    this._destroyed = false;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;

    // Forward local Y.Doc updates to the server
    this._docUpdateHandler = (update, origin) => {
      if (origin === this) return; // avoid echo
      this._sendUpdate(update);
    };

    // Forward local awareness changes to the server
    this._awarenessUpdateHandler = ({ added, updated, removed }) => {
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      const encoder = encoding.createEncoder();
      encoding.writeVarUint8Array(
        encoder,
        awarenessProtocol.encodeAwarenessUpdate(awareness, changed)
      );
      const encoded = encoding.toUint8Array(encoder);
      // Prepend awareness type byte
      const msg = new Uint8Array(1 + encoded.length);
      msg[0] = MSG_AWARENESS;
      msg.set(encoded, 1);
      this._sendRaw(msg);
    };

    ydoc.on("update", this._docUpdateHandler);
    awareness.on("update", this._awarenessUpdateHandler);

    this._connect();
  }

  // ------------------------------------------------------------------ //
  // Connection management
  // ------------------------------------------------------------------ //

  _connect() {
    if (this._destroyed) return;

    this._onStatusChange("connecting");

    // Always re-read the token fresh (handles silent JWT refresh between reconnects).
    // Strip any existing query string from the base URL before appending,
    // so we never end up with ?token=X&token=Y.
    const token = localStorage.getItem("access_token") || "";
    const baseWithoutQuery = this._wsUrlBase.split("?")[0];
    const url = `${baseWithoutQuery}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    ws.binaryType = "arraybuffer";
    this._ws = ws;

    ws.onopen = () => {
      this._reconnectAttempt = 0;
      this._onStatusChange("connected");
      this._sendSyncStep1();
      this._sendAwarenessState();
    };

    ws.onmessage = (event) => {
      this._handleMessage(new Uint8Array(event.data));
    };

    ws.onerror = (err) => {
      console.warn("[YjsWS] error", err);
    };

    ws.onclose = (event) => {
      this._ws = null;
      this._onStatusChange("disconnected");
      this._onPeersChange(0);
      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    };
  }

  _scheduleReconnect() {
    const delay = Math.min(
      RECONNECT_BASE_MS * 2 ** this._reconnectAttempt,
      RECONNECT_MAX_MS
    );
    this._reconnectAttempt += 1;
    this._reconnectTimer = setTimeout(() => this._connect(), delay);
  }

  destroy() {
    this._destroyed = true;
    clearTimeout(this._reconnectTimer);
    this._ydoc.off("update", this._docUpdateHandler);
    this._awareness.off("update", this._awarenessUpdateHandler);

    // Remove local awareness entry so remote peers show us as gone
    awarenessProtocol.removeAwarenessStates(
      this._awareness,
      [this._ydoc.clientID],
      this
    );

    if (this._ws) {
      this._ws.onclose = null; // prevent reconnect
      this._ws.close();
      this._ws = null;
    }
  }

  // ------------------------------------------------------------------ //
  // Protocol: sending
  // ------------------------------------------------------------------ //

  _sendSyncStep1() {
    const encoder = encoding.createEncoder();
    syncProtocol.writeSyncStep1(encoder, this._ydoc);
    const encoded = encoding.toUint8Array(encoder);
    // The encoded sync message already has the sub-type in it, but our backend
    // expects byte 0 = MSG_SYNC_STEP_1, so we wrap it.
    const sv = Y.encodeStateVector(this._ydoc);
    const msg = new Uint8Array(1 + sv.length);
    msg[0] = MSG_SYNC_STEP_1;
    msg.set(sv, 1);
    this._sendRaw(msg);
  }

  _sendAwarenessState() {
    const encoded = awarenessProtocol.encodeAwarenessUpdate(this._awareness, [
      this._ydoc.clientID,
    ]);
    const msg = new Uint8Array(1 + encoded.length);
    msg[0] = MSG_AWARENESS;
    msg.set(encoded, 1);
    this._sendRaw(msg);
  }

  _sendUpdate(update) {
    const msg = new Uint8Array(1 + update.length);
    msg[0] = MSG_UPDATE;
    msg.set(update, 1);
    this._sendRaw(msg);
  }

  _sendRaw(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(data);
    }
  }

  // ------------------------------------------------------------------ //
  // Protocol: receiving
  // ------------------------------------------------------------------ //

  _handleMessage(data) {
    if (data.length === 0) return;
    const msgType = data[0];
    const payload = data.slice(1);

    switch (msgType) {
      case MSG_SYNC_STEP_2: {
        // Server is sending all updates we're missing — apply them
        Y.applyUpdate(this._ydoc, payload, this);
        break;
      }

      case MSG_UPDATE: {
        // Incremental update from a peer
        Y.applyUpdate(this._ydoc, payload, this);
        break;
      }

      case MSG_AWARENESS: {
        // Remote cursor / presence update
        awarenessProtocol.applyAwarenessUpdate(
          this._awareness,
          payload,
          this
        );
        // Count peers (exclude self)
        const states = this._awareness.getStates();
        const peerCount = [...states.keys()].filter(
          (id) => id !== this._ydoc.clientID
        ).length;
        this._onPeersChange(peerCount);
        break;
      }

      default:
        console.warn("[YjsWS] unknown message type", msgType);
    }
  }
}