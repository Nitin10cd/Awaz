from django.urls import re_path
from speech import consumers

websocket_urlpatterns = [
    re_path(r'ws/speech/$',  consumers.SpeechConsumer.as_asgi()),
]