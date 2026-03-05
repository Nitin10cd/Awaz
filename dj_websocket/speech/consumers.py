import json
import asyncio
from channels.generic.websocket import AsyncWebsocketConsumer
from speech.session import Session, sessions
from speech.asr import transcribe_chunk
from speech.agent import DoctorAgent, agents


class SpeechConsumer(AsyncWebsocketConsumer):
    """
    Handles real-time audio streaming from the patient browser.

    Flow:
        Patient mic → AUDIO_CHUNK → ElevenLabs ASR → text
                                                        ↓
                                              DoctorAgent (Groq + Tavily)
                                                        ↓
                                              AGENT_RESPONSE → Patient browser
    """

    MAX_PENDING_TASKS = 50

    async def connect(self):
        self.session_id = None
        await self.accept()
        print("[WS] Client connected")

    async def disconnect(self, close_code):
        # Cancel any in-flight ASR tasks
        if self.session_id and self.session_id in sessions:
            session = sessions[self.session_id]
            for task in session.pending_tasks:
                task.cancel()
            del sessions[self.session_id]

        # Clean up the doctor agent for this session
        if self.session_id and self.session_id in agents:
            del agents[self.session_id]

        print(f"[WS] Cleaned up session {self.session_id}")

    async def receive(self, text_data=None, bytes_data=None):
        if not text_data:
            await self.send_error("Only JSON text frames accepted", "INVALID_FRAME")
            return
        try:
            data = json.loads(text_data)
        except json.JSONDecodeError:
            await self.send_error("Invalid JSON", "INVALID_JSON")
            return

        msg_type = data.get("type")
        handlers = {
            "START":       self.handle_start,
            "AUDIO_CHUNK": self.handle_audio_chunk,
            "STOP":        self.handle_stop,
            "SUMMARIZE":   self.handle_summarize,
        }
        handler = handlers.get(msg_type)
        if handler:
            await handler(data)
        else:
            await self.send_error(f"Unknown type: {msg_type}", "UNKNOWN_TYPE")

    async def handle_start(self, data: dict):
        session_id   = data.get("session_id", "").strip()
        patient_name = data.get("patient_name", "Patient").strip()
        diagnosis    = data.get("diagnosis", "unknown").strip()

        if not session_id:
            await self.send_error("session_id is required", "INVALID_START")
            return

        # Create session and doctor agent for this consultation
        sessions[session_id] = Session(session_id, ["patient"])
        self.session_id = session_id

        agent = DoctorAgent(
            patient_name=patient_name,
            diagnosis=diagnosis,
        )
        agents[session_id] = agent

        await self.send(text_data=json.dumps({
            "type":       "SESSION_STARTED",
            "session_id": session_id,
        }))
        print(f"[SESSION] Started | id={session_id} | patient={patient_name}")

        # Generate and send the opening greeting from Dr. Medical A
        print(f"[AGENT] Generating greeting...")
        greeting = await agent.greet()
        await self.send(text_data=json.dumps({
            "type":        "AGENT_RESPONSE",
            "text":        greeting,
            "is_greeting": True,
        }))
        print(f"[AGENT] Greeting sent: {repr(greeting[:60])}...")

    async def handle_audio_chunk(self, data: dict):
        session_id   = data.get("session_id")
        sequence     = data.get("sequence")
        timestamp_ms = data.get("timestamp_ms")
        audio_b64    = data.get("audio")

        if not session_id or session_id not in sessions:
            await self.send_error("Send START before sending audio", "NO_SESSION")
            return
        if sequence is None or timestamp_ms is None or not audio_b64:
            await self.send_error("sequence, timestamp_ms and audio are required", "INVALID_CHUNK")
            return

        session = sessions[session_id]

        # Drop chunk if too many tasks are pending (backpressure)
        active = [t for t in session.pending_tasks if not t.done()]
        if len(active) >= self.MAX_PENDING_TASKS:
            async with session.lock:
                session.speakers["patient"].dropped_count += 1
            return

        async with session.lock:
            session.speakers["patient"].chunk_count += 1

        # Fire ASR + agent processing as a background task
        task = asyncio.create_task(
            self._process_chunk(
                session, sequence, timestamp_ms, audio_b64
            )
        )
        session.pending_tasks.append(task)

    async def _process_chunk(
        self,
        session: Session,
        sequence: int,
        timestamp_ms: int,
        audio_b64: str,
    ):
        try:
            # Step 1 — Transcribe audio via ElevenLabs Scribe
            patient_text = await transcribe_chunk(audio_b64, "patient")

            if not patient_text.strip():
                print(f"[ASR] Empty transcript seq={sequence} — skipping agent")
                return

            print(f"[ASR] Patient said: {repr(patient_text)}")

            # Step 2 — Store patient utterance in transcript
            async with session.lock:
                session.transcript_entries.append({
                    "timestamp_ms": timestamp_ms,
                    "sequence":     sequence,
                    "speaker":      "patient",
                    "text":         patient_text,
                })

            # Step 3 — Send transcribed text to browser immediately
            await self.send(text_data=json.dumps({
                "type":     "PATIENT_TEXT",
                "sequence": sequence,
                "text":     patient_text,
            }))

            # Step 4 — Pass patient text to the doctor agent
            agent = agents.get(session.session_id)
            if not agent:
                return

            print(f"[AGENT] Thinking...")
            agent_response = await agent.respond(patient_text)

            # Step 5 — Store doctor response in transcript
            async with session.lock:
                session.transcript_entries.append({
                    "timestamp_ms": timestamp_ms + 1,
                    "sequence":     sequence,
                    "speaker":      "doctor",
                    "text":         agent_response,
                })

            # Step 6 — Send doctor response back to browser
            await self.send(text_data=json.dumps({
                "type": "AGENT_RESPONSE",
                "text": agent_response,
            }))
            print(f"[AGENT] Response: {repr(agent_response[:60])}...")

        except asyncio.CancelledError:
            pass
        except Exception as e:
            print(f"[ERROR] chunk processing: {e}")

    async def handle_stop(self, data: dict):
        session_id = data.get("session_id")

        if not session_id or session_id not in sessions:
            await self.send_error("No active session found", "NO_SESSION")
            return

        session = sessions[session_id]

        # Idempotent guard — only process STOP once
        async with session.lock:
            if session.stop_called:
                return
            session.stop_called = True

        # Wait for all in-flight ASR tasks to finish
        pending = [t for t in session.pending_tasks if not t.done()]
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)

        ordered  = session.get_ordered_transcript()
        stats    = session.get_stats()
        duration = session.get_duration_ms()

        await self.send(text_data=json.dumps({
            "type":       "FINAL",
            "session_id": session_id,
            "transcript": ordered,
            "stats": {
                spk: {**s, "duration_ms": round(duration)}
                for spk, s in stats.items()
            },
        }))

        print(f"[SESSION] Finalised | {len(ordered)} lines")
        del sessions[session_id]
        await self.close()

    async def handle_summarize(self, data: dict):
        session_id = data.get("session_id")

        if not session_id or session_id not in agents:
            await self.send_error("No active agent found", "NO_SESSION")
            return

        agent = agents[session_id]

        # Ask agent to generate a structured clinical summary
        print(f"[AGENT] Generating summary...")
        summary = await agent.summarize()

        await self.send(text_data=json.dumps({
            "type":    "SUMMARY",
            "content": summary,
        }))
        print(f"[AGENT] Summary sent")

    async def send_error(self, reason: str, code: str):
        await self.send(text_data=json.dumps({
            "type":   "ERROR",
            "reason": reason,
            "code":   code,
        }))
        print(f"[ERROR] {code}: {reason}")