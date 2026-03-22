"""
Y.js WebSocket consumer for real-time document collaboration.
Uses ThreadPoolExecutor for DB calls to avoid Python 3.14 async deadlocks.
"""

import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

from channels.generic.websocket import AsyncWebsocketConsumer
from .yjs_store import YjsDocumentStore

logger = logging.getLogger(__name__)
_store = YjsDocumentStore()
_db_executor = ThreadPoolExecutor(max_workers=4)

MSG_SYNC_STEP_1 = 0
MSG_SYNC_STEP_2 = 1
MSG_UPDATE = 2
MSG_AWARENESS = 3
MSG_HTML = 4  # Client sends current HTML for DB persistence


def _sync_authenticate(token_str):
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model
        token = AccessToken(token_str)
        User = get_user_model()
        user = User.objects.get(id=token["user_id"])
        return str(user.id), getattr(user, "username", str(user.id))
    except Exception as exc:
        logger.warning("[yjs] auth error: %s", exc)
        return None, None


def _sync_check_access(document_id, user_id_str):
    try:
        from documents.models import Document
        doc = Document.objects.get(id=document_id)
        return str(doc.owner_id) == user_id_str or bool(doc.is_public)
    except Exception as exc:
        logger.warning("[yjs] access check error: %s", exc)
        return False


def _sync_save_html(document_id, html):
    """Save HTML content to the Document model for persistence across restarts."""
    try:
        from documents.models import Document
        Document.objects.filter(id=document_id).update(content=html)
        logger.debug("[yjs] saved HTML to DB doc=%s len=%d", document_id, len(html))
    except Exception as exc:
        logger.warning("[yjs] failed to save HTML doc=%s error=%s", document_id, exc)


class YjsDocumentConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.document_id = self.scope["url_route"]["kwargs"]["document_id"]
        self.room_group = f"doc_{self.document_id}"
        self.username = "?"

        await self.accept()

        try:
            token_str = self._extract_token()
            if not token_str:
                await self.close(code=4001)
                return

            loop = asyncio.get_event_loop()

            user_id, username = await asyncio.wait_for(
                loop.run_in_executor(_db_executor, _sync_authenticate, token_str),
                timeout=10.0
            )

            if user_id is None:
                await self.close(code=4001)
                return

            accessible = await asyncio.wait_for(
                loop.run_in_executor(_db_executor, _sync_check_access,
                                     self.document_id, user_id),
                timeout=10.0
            )

            if not accessible:
                await self.close(code=4004)
                return

            self.username = username
            await self.channel_layer.group_add(self.room_group, self.channel_name)

            # Send existing Y.js state to new client so they fast-forward
            existing_state = _store.get_state(self.document_id)
            if existing_state:
                await self.send(bytes_data=_msg(MSG_SYNC_STEP_2, existing_state))

            logger.info("[yjs] connect user=%s doc=%s", self.username, self.document_id)

        except asyncio.TimeoutError:
            logger.error("[yjs] DB timeout doc=%s", self.document_id)
            await self.close(code=1011)
        except Exception as exc:
            logger.exception("[yjs] connect error: %s", exc)
            await self.close(code=1011)

    async def disconnect(self, close_code):
        try:
            if hasattr(self, "room_group") and self.channel_layer:
                await self.channel_layer.group_discard(self.room_group, self.channel_name)
        except Exception:
            pass
        logger.info("[yjs] disconnect user=%s doc=%s code=%s",
                    self.username, getattr(self, "document_id", "?"), close_code)

    async def receive(self, text_data=None, bytes_data=None):
        if not bytes_data:
            return

        # Guard: ignore text frames
        if isinstance(bytes_data, str):
            return

        msg_type = bytes_data[0]
        payload = bytes_data[1:]

        try:
            if msg_type == MSG_SYNC_STEP_1:
                # Client is syncing — send back everything we have
                state = _store.get_state(self.document_id)
                if state:
                    await self.send(bytes_data=_msg(MSG_SYNC_STEP_2, state))

            elif msg_type == MSG_UPDATE:
                # Store the update in memory
                _store.apply_update(self.document_id, payload)
                # Broadcast to all other peers in this document's room
                await self.channel_layer.group_send(self.room_group, {
                    "type": "yjs.update",
                    "sender": self.channel_name,
                    "data": list(bytes_data),
                })

            elif msg_type == MSG_HTML:
                # Client sends current HTML — persist to DB
                html = bytes_data[1:].decode('utf-8', errors='replace')
                loop = asyncio.get_event_loop()
                loop.run_in_executor(_db_executor, _sync_save_html, self.document_id, html)

            elif msg_type == MSG_AWARENESS:
                # Relay presence/cursor info — not stored
                await self.channel_layer.group_send(self.room_group, {
                    "type": "yjs.awareness",
                    "sender": self.channel_name,
                    "data": list(bytes_data),
                })

        except Exception as exc:
            logger.exception("[yjs] receive error: %s", exc)

    async def yjs_update(self, event):
        """Relay a Y.js update to this client, skip the sender."""
        if event["sender"] == self.channel_name:
            return
        await self.send(bytes_data=bytes(event["data"]))

    async def yjs_awareness(self, event):
        """Relay awareness to this client, skip the sender."""
        if event["sender"] == self.channel_name:
            return
        await self.send(bytes_data=bytes(event["data"]))

    def _extract_token(self):
        qs = self.scope.get("query_string", b"").decode()
        for part in qs.split("&"):
            if "=" in part:
                k, v = part.split("=", 1)
                if k == "token":
                    return v
        return ""


def _msg(msg_type, payload):
    return bytes([msg_type]) + payload