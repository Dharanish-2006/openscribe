"""
ASGI config — wraps Django with Channels for WebSocket support.

Replace the existing asgi.py entirely with this file.
"""

import os

from channels.auth import AuthMiddlewareStack
from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
from django.core.asgi import get_asgi_application

from openscribe.routing import websocket_urlpatterns

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "openscribe.settings")

django_asgi_app = get_asgi_application()

