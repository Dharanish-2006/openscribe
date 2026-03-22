import * as Y from "yjs";
import * as awarenessProtocol from "y-protocols/awareness";

const MSG_SYNC_STEP_1 = 0;
const MSG_SYNC_STEP_2 = 1;
const MSG_UPDATE = 2;
const MSG_AWARENESS = 3;

const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export class YjsWebSocketProvider {
  constructor(wsUrl, ydoc, awareness, opts = {}) {
    this._wsUrlBase = wsUrl;
    this._ydoc = ydoc;
    this._awareness = awareness;
    this._onStatusChange = opts.onStatusChange || (() => {});
    this._onPeersChange = opts.onPeersChange || (() => {});

    this._ws = null;
    this._destroyed = false;
    this._reconnectAttempt = 0;
    this._reconnectTimer = null;

    this._docUpdateHandler = (update, origin) => {
      if (origin === this) return;
      this._sendUpdate(update);
    };

    this._awarenessUpdateHandler = ({ added, updated, removed }) => {
      const changed = [...added, ...updated, ...removed];
      if (changed.length === 0) return;
      const encoded = awarenessProtocol.encodeAwarenessUpdate(this._awareness, changed);
      this._sendRaw(this._prependType(MSG_AWARENESS, encoded));
    };

    ydoc.on("update", this._docUpdateHandler);
    awareness.on("update", this._awarenessUpdateHandler);

    this._connect();
  }

  _connect() {
    if (this._destroyed) return;

    this._onStatusChange("connecting");

    const token = localStorage.getItem("access_token") || "";
    const baseWithoutQuery = this._wsUrlBase.split("?")[0];
    const url = `${baseWithoutQuery}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);

    // CRITICAL: set binaryType immediately after construction,
    // before the socket has a chance to receive any message
    ws.binaryType = "arraybuffer";

    this._ws = ws;

    ws.onopen = () => {
      this._reconnectAttempt = 0;
      this._onStatusChange("connected");
      this._sendSyncStep1();
      this._sendAwarenessState();
    };

    ws.onmessage = (event) => {
      // Guard: ignore text frames entirely — we only speak binary
      if (typeof event.data === "string") {
        console.warn("[YjsWS] unexpected text frame, ignoring:", event.data.slice(0, 100));
        return;
      }
      // Guard: must be ArrayBuffer
      if (!(event.data instanceof ArrayBuffer)) {
        console.warn("[YjsWS] unexpected data type:", typeof event.data);
        return;
      }
      this._handleMessage(new Uint8Array(event.data));
    };

    ws.onerror = (err) => {
      if (this._destroyed) return;
      console.warn("[YjsWS] error", err);
    };

    ws.onclose = () => {
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

    awarenessProtocol.removeAwarenessStates(
      this._awareness,
      [this._ydoc.clientID],
      this
    );

    if (this._ws) {
      this._ws.onclose = null;
      this._ws.close();
      this._ws = null;
    }
  }

  _sendSyncStep1() {
    const sv = Y.encodeStateVector(this._ydoc);
    this._sendRaw(this._prependType(MSG_SYNC_STEP_1, sv));
  }

  _sendAwarenessState() {
    const encoded = awarenessProtocol.encodeAwarenessUpdate(
      this._awareness,
      [this._ydoc.clientID]
    );
    this._sendRaw(this._prependType(MSG_AWARENESS, encoded));
  }

  _sendUpdate(update) {
    this._sendRaw(this._prependType(MSG_UPDATE, update));
  }

  _prependType(type, payload) {
    const msg = new Uint8Array(1 + payload.length);
    msg[0] = type;
    msg.set(payload, 1);
    return msg;
  }

  _sendRaw(data) {
    if (this._ws && this._ws.readyState === WebSocket.OPEN) {
      this._ws.send(data);
    }
  }

  _handleMessage(data) {
    if (!data || data.length === 0) return;
    const msgType = data[0];
    const payload = data.slice(1);

    try {
      switch (msgType) {
        case MSG_SYNC_STEP_2:
          Y.applyUpdate(this._ydoc, payload, this);
          break;

        case MSG_UPDATE:
          Y.applyUpdate(this._ydoc, payload, this);
          break;

        case MSG_AWARENESS:
          awarenessProtocol.applyAwarenessUpdate(this._awareness, payload, this);
          const states = this._awareness.getStates();
          const peerCount = [...states.keys()].filter(
            (id) => id !== this._ydoc.clientID
          ).length;
          this._onPeersChange(peerCount);
          break;

        default:
          console.warn("[YjsWS] unknown message type:", msgType);
      }
    } catch (err) {
      console.warn("[YjsWS] error handling message type", msgType, err);
    }
  }
}