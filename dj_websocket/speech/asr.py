import base64
import asyncio
import io
from django.conf import settings
from elevenlabs.client import AsyncElevenLabs

_client = None


def get_client() -> AsyncElevenLabs:
    global _client
    if _client is None:
        _client = AsyncElevenLabs(api_key=settings.ELEVENLABS_API_KEY)
    return _client


async def transcribe_chunk(audio_b64: str, speaker_id: str) -> str:
    """
    Base64 audio → ElevenLabs Scribe v2 → transcript string.
    Browser se webm/opus format aata hai — ElevenLabs accept karta hai.
    """
    try:
        audio_bytes = base64.b64decode(audio_b64)

        # Too small chunks skip karo — silence ya garbage hai
        if len(audio_bytes) < 1000:
            print(f"[ASR SKIP] speaker={speaker_id} | chunk too small ({len(audio_bytes)} bytes)")
            return ""

        audio_file = io.BytesIO(audio_bytes)
        # Browser se webm aata hai
        audio_file.name = f"{speaker_id}.webm"

        client = get_client()

        response = await client.speech_to_text.convert(
            file=audio_file,
            model_id="scribe_v2",
            language_code="en",
        )

        text = response.text if response.text else ""
        print(f"[ASR OK] speaker={speaker_id} | text={repr(text)}")
        return text

    except Exception as e:
        print(f"[ASR ERROR] speaker={speaker_id} | {e}")
        return ""