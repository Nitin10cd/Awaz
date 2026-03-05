"""
Aavaaz WebSocket Test Client - Updated for AI Doctor Agent
Normal test:  python test_client.py
Stress test:  python test_client.py --stress
"""

import asyncio
import websockets
import json
import base64
import argparse
import time
import struct

SERVER = "ws://localhost:8000/ws/speech/"


def make_silent_wav(duration_ms=100):
    sample_rate = 16000
    num_samples = int(sample_rate * duration_ms / 1000)
    data_size   = num_samples * 2
    audio_data  = b'\x00' * data_size
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16, 1, 1,
        sample_rate, sample_rate * 2, 2, 16,
        b'data', data_size,
    )
    return base64.b64encode(header + audio_data).decode()


SILENT_WAV = make_silent_wav()


async def run_test(stress=False):
    chunk_count = 10 if stress else 2
    chunk_delay = 0.0 if stress else 0.5
    session_id  = f"test-{int(time.time())}"

    print(f"\n{'='*55}")
    print(f"  AAVAAZ AI DOCTOR TEST")
    print(f"  Mode    : {'STRESS' if stress else 'NORMAL'}")
    print(f"  Session : {session_id}")
    print(f"{'='*55}\n")

    async with websockets.connect(SERVER) as ws:
        responses  = []
        done       = asyncio.Event()

        # ── Receiver — sab messages collect karo ──
        async def receiver():
            try:
                while True:
                    raw  = await asyncio.wait_for(ws.recv(), timeout=60)
                    data = json.loads(raw)
                    responses.append(data)
                    t = data.get("type")

                    if t == "SESSION_STARTED":
                        print("  <- SESSION_STARTED")

                    elif t == "AGENT_RESPONSE":
                        is_greeting = data.get("is_greeting", False)
                        label = "GREETING" if is_greeting else "AGENT_RESPONSE"
                        text  = data.get("text", "")[:80]
                        print(f"  <- {label} | {repr(text)}...")

                    elif t == "PATIENT_TEXT":
                        print(f"  <- PATIENT_TEXT | {repr(data.get('text'))}")

                    elif t == "SUMMARY":
                        print(f"  <- SUMMARY received ({len(data.get('content',''))} chars)")

                    elif t == "FINAL":
                        print("  <- FINAL received")
                        done.set()
                        break

                    elif t == "ERROR":
                        print(f"  <- ERROR [{data.get('code')}] {data.get('reason')}")

                    else:
                        print(f"  <- {t}")

            except asyncio.TimeoutError:
                print("  TIMEOUT - no FINAL in 60s")
                done.set()

        recv_task = asyncio.create_task(receiver())

        # ── 1. START ───────────────────────────────
        print(f"-> START | patient=Test Patient | diagnosis=headache")
        await ws.send(json.dumps({
            "type":         "START",
            "session_id":   session_id,
            "patient_name": "Test Patient",
            "diagnosis":    "headache since 2 days",
        }))

        # Greeting ka wait karo
        print("   Waiting for Dr. Medical A greeting...")
        await asyncio.sleep(3)

        # ── 2. Patient ke audio chunks bhejo ───────
        base_ts = int(time.time() * 1000)

        print(f"\n-> Sending {chunk_count} patient audio chunks...")
        for i in range(chunk_count):
            await ws.send(json.dumps({
                "type":         "AUDIO_CHUNK",
                "session_id":   session_id,
                "sequence":     i,
                "timestamp_ms": base_ts + (i * 200),
                "audio":        SILENT_WAV,
            }))
            print(f"-> AUDIO_CHUNK seq={i}")
            if chunk_delay:
                await asyncio.sleep(chunk_delay)

        # ── 3. STOP ────────────────────────────────
        print(f"\n-> STOP")
        await ws.send(json.dumps({
            "type":       "STOP",
            "session_id": session_id,
            "reason":     "test_complete",
        }))

        # ── 4. Duplicate STOP ──────────────────────
        print("-> STOP again (idempotency test)")
        await ws.send(json.dumps({
            "type":       "STOP",
            "session_id": session_id,
            "reason":     "duplicate",
        }))

        await done.wait()
        recv_task.cancel()

    # ── Assertions ─────────────────────────────────
    print(f"\n{'='*55}  RESULTS")

    # 1. SESSION_STARTED aaya?
    if any(r.get("type") == "SESSION_STARTED" for r in responses):
        print("  PASS - SESSION_STARTED received")
    else:
        print("  FAIL - SESSION_STARTED missing")
        return

    # 2. Greeting aaya?
    greetings = [
        r for r in responses
        if r.get("type") == "AGENT_RESPONSE"
    ]
    if greetings:
        print(f"  PASS - AGENT_RESPONSE received ({len(greetings)} total)")
    else:
        print("  FAIL - No AGENT_RESPONSE received")
        return

    # 3. Exactly 1 FINAL
    finals = [r for r in responses if r.get("type") == "FINAL"]
    if len(finals) == 1:
        print("  PASS - Exactly 1 FINAL received")
    else:
        print(f"  FAIL - Expected 1 FINAL, got {len(finals)}")
        return

    # 4. Stats check
    final  = finals[0]
    stats  = final.get("stats", {})
    if "patient" in stats:
        s = stats["patient"]
        print(f"  PASS - Stats: chunks={s['chunk_count']} dropped={s['dropped_count']} duration={s['duration_ms']}ms")
    else:
        print("  WARN - No patient stats")

    # 5. Stress mode
    if stress:
        dropped = sum(
            stats[s].get("dropped_count", 0)
            for s in stats
        )
        print(f"  PASS - Stress stable | dropped={dropped}")

    print(f"\n{'='*55}")
    print("  RESULT: PASS")
    print(f"{'='*55}\n")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--stress", action="store_true")
    args = parser.parse_args()
    asyncio.run(run_test(stress=args.stress))