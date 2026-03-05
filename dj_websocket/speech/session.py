import asyncio
import time


class Speaker:
    """Tracks chunk stats for a single speaker in a session."""

    def __init__(self, speaker_id: str):
        self.speaker_id    = speaker_id
        self.chunk_count   = 0
        self.dropped_count = 0


class Session:
    """
    Holds the complete state of one active WebSocket consultation.

    Ordering:
        Each ASR result is stored with (timestamp_ms, sequence, speaker, text).
        On STOP, entries are sorted by timestamp_ms + sequence to produce
        a correctly ordered transcript regardless of ASR arrival order.

    Backpressure:
        If pending tasks exceed MAX_PENDING_TASKS, chunks are dropped
        gracefully rather than crashing the connection.
    """

    def __init__(self, session_id: str, speakers: list):
        self.session_id    = session_id
        self.started_at_ms = time.time() * 1000

        # One Speaker instance per role
        self.speakers = {s: Speaker(s) for s in speakers}

        # Completed ASR results waiting to be ordered
        self.transcript_entries = []

        # In-flight asyncio tasks — drained on STOP
        self.pending_tasks = []

        # Ensures only one FINAL message is ever sent
        self.stop_called = False

        # Protects shared state across concurrent tasks
        self.lock = asyncio.Lock()

    def is_valid_speaker(self, speaker_id: str) -> bool:
        return speaker_id in self.speakers

    def get_duration_ms(self) -> float:
        return (time.time() * 1000) - self.started_at_ms

    def get_stats(self) -> dict:
        return {
            sid: {
                "chunk_count":   s.chunk_count,
                "dropped_count": s.dropped_count,
            }
            for sid, s in self.speakers.items()
        }

    def get_ordered_transcript(self) -> list:
        """
        Sorts transcript entries by (timestamp_ms, sequence) and returns
        formatted lines. This is the core ordering guarantee of the system.

        Example:
            Doctor  @ 100ms → "[doctor]: Good morning"
            Patient @ 200ms → "[patient]: Hello doctor"
            Doctor  @ 300ms → "[doctor]: How are you feeling?"

            Even if the 300ms ASR result arrives first, the final
            transcript reflects capture order, not arrival order.
        """
        sorted_entries = sorted(
            self.transcript_entries,
            key=lambda e: (e["timestamp_ms"], e["sequence"])
        )
        return [
            f"[{e['speaker']}]: {e['text']}"
            for e in sorted_entries
            if e["text"].strip()
        ]


# In-memory session store — one entry per active WebSocket connection
# For multi-worker deployments this should be replaced with Redis
sessions: dict = {}