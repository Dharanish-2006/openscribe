# openscribe/asgi.py

import os
from django.core.asgi import get_asgi_application
from channels.routing import ProtocolTypeRouter, URLRouter
from api.middleware import JWTAuthMiddleware
import api.routing

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "openscribe.settings")

django_asgi_app = get_asgi_application()

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    "websocket": JWTAuthMiddleware(
        URLRouter(
            api.routing.websocket_urlpatterns
        )
    ),
})