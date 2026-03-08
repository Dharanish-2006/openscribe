"""
ASGI WebSocket URL routing for Y.js real-time sync.
"""

from django.urls import re_path
from documents.consumers import YjsDocumentConsumer

websocket_urlpatterns = [
    re_path(
        r"^ws/documents/(?P<document_id>[0-9a-f-]+)/$",
        YjsDocumentConsumer.as_asgi(),
    ),
]
