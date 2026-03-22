import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor

from channels.generic.websocket import AsyncWebsocketConsumer
from .yjs_store import YjsDocumentStore

logger = logging.getLogger(__name__)
_store = YjsDocumentStore()

# Single shared thread pool for DB work
_db_executor = ThreadPoolExecutor(max_workers=4)

MSG_SYNC_STEP_1 = 0
MSG_SYNC_STEP_2 = 1
MSG_UPDATE = 2
MSG_AWARENESS = 3


def _sync_authenticate(token_str):
    """Pure sync — validate JWT, return (user_id_str, username) or (None, None)."""
    try:
        import django
        django.setup()
    except RuntimeError:
        pass
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
    """Pure sync — return True if user owns doc or doc is public."""
    try:
        from documents.models import Document
        doc = Document.objects.get(id=document_id)
        return str(doc.owner_id) == user_id_str or bool(doc.is_public)
    except Exception as exc:
        logger.warning("[yjs] access check error: %s", exc)
        return False


class YjsDocumentConsumer(AsyncWebsocketConsumer):

    async def connect(self):
        self.document_id = self.scope["url_route"]["kwargs"]["document_id"]
        self.room_group = f"doc_{self.document_id}"
        self.username = "?"
        
        await self.accept()
        
        try:
            await self.channel_layer.group_add(self.room_group, self.channel_name)
            existing_state = _store.get_state(self.document_id)
            if existing_state:
                await self.send(bytes_data=_msg(MSG_SYNC_STEP_2, existing_state))
            print(f"[yjs] CONNECTED doc={self.document_id}", flush=True)
        except Exception as exc:
            import traceback
            print(f"[yjs] CONNECT ERROR: {traceback.format_exc()}", flush=True)
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
        msg_type = bytes_data[0]
        payload = bytes_data[1:]
        try:
            if msg_type == MSG_SYNC_STEP_1:
                state = _store.get_state(self.document_id)
                if state:
                    await self.send(bytes_data=_msg(MSG_SYNC_STEP_2, state))
            elif msg_type == MSG_UPDATE:
                _store.apply_update(self.document_id, payload)
                await self.channel_layer.group_send(self.room_group, {
                    "type": "yjs.update",
                    "sender": self.channel_name,
                    "data": list(bytes_data),
                })
            elif msg_type == MSG_AWARENESS:
                await self.channel_layer.group_send(self.room_group, {
                    "type": "yjs.awareness",
                    "sender": self.channel_name,
                    "data": list(bytes_data),
                })
        except Exception as exc:
            logger.exception("[yjs] receive error: %s", exc)

    async def yjs_update(self, event):
        if event["sender"] == self.channel_name:
            return
        await self.send(bytes_data=bytes(event["data"]))

    async def yjs_awareness(self, event):
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