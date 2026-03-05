import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom"
import { usePatient } from "../context/PatientContext"

// async function speakText(text) {
//   try {
//     const clean = text
//       .replace(/\[.*?\]\(.*?\)/g, "")
//       .replace(/[*_#`]/g, "");

//     if (!clean.trim()) return;

//     const response = await fetch(
//       "https://api.elevenlabs.io/v1/text-to-speech/XrExE9yKIg1WjnnlVkGX/stream",
//       {
//         method: "POST",
//         headers: {
//           "xi-api-key": EL_API_KEY,
//           "Content-Type": "application/json",
//         },
//         body: JSON.stringify({
//           text: clean,
//           model_id: "eleven_turbo_v2",
//           voice_settings: {
//             stability: 0.5,
//             similarity_boost: 0.75,
//           },
//         }),
//       }
//     );

//     if (!response.ok) {
//       console.error("ElevenLabs TTS error:", response.status);
//       return;
//     }

//     const blob  = await response.blob();
//     const url   = URL.createObjectURL(blob);
//     const audio = new Audio(url);

//     audio.onended = () => URL.revokeObjectURL(url);
//     audio.play();

//   } catch (e) {
//     console.error("TTS failed:", e);
//   }
// }
// Browser TTS - speaks doctor response aloud
function speakText(text) {
  const clean = text
    .replace(/\[.*?\]\(.*?\)/g, "")
    .replace(/[*_#`]/g, "")
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.lang  = "en-US"
  utterance.rate  = 0.95
  utterance.pitch = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

// Renders markdown - handles bold, headers, links
const renderText = (text) => {
  if (!text) return null
  return text.split("\n").map((line, i) => {
    if (line.trim() === "---")
      return <hr key={i} className="summaryHr" />
    if (line.startsWith("##")) {
      const cleanHeader = line.replace(/^#+\s*/, "")
      return <h3 key={i} className="summaryH3">{cleanHeader}</h3>
    }
    const parts = line.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g)
    const formattedLine = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**"))
        return <strong key={j}>{part.slice(2, -2)}</strong>
      const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/)
      if (linkMatch)
        return (
          <a key={j} href={linkMatch[2]} target="_blank"
            rel="noreferrer" className="summaryLink">
            {linkMatch[1]}
          </a>
        )
      return part
    })
    return <div key={i} className="summaryLine">{formattedLine}</div>
  })
}

const WS_URL = "ws://localhost:8000/ws/speech/"

export default function ConsultationPage() {
  const { patient, fetchU, loading } = usePatient()
  const navigate     = useNavigate()
  const bottomRef    = useRef(null)
  const wsRef        = useRef(null)
  const seqRef       = useRef(0)
  const sessionIdRef = useRef(`session-${Date.now()}`)
  const recorderRef  = useRef(null)
  const streamRef    = useRef(null)
  const hasConnected = useRef(false)

  const [messages,       setMessages]       = useState([])
  const [thinking,       setThinking]       = useState(false)
  const [voiceEnabled,   setVoiceEnabled]   = useState(true)
  const [listening,      setListening]      = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")
  const [summary,        setSummary]        = useState(null)
  const [isSummarizing,  setIsSummarizing]  = useState(false)
  const [wsStatus,       setWsStatus]       = useState("connecting")

  // Fetch patient on mount
  useEffect(() => {
    fetchU?.()
  }, [])

  // Redirect if no patient found
  useEffect(() => {
    if (!loading && !patient) {
      navigate("/patient")
    }
  }, [loading, patient, navigate])

  // Connect WebSocket once patient data is ready
  useEffect(() => {
    if (!loading && patient && !hasConnected.current) {
      hasConnected.current = true
      connectWS()
    }
    return () => {
      wsRef.current?.close()
      stopMic()
    }
  }, [loading, patient])

  // Auto scroll to latest message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, thinking])

  // Speak doctor response when it arrives
  useEffect(() => {
    const last = messages[messages.length - 1]
    if (last?.role === "bot" && voiceEnabled) {
      speakText(last.text)
    }
  }, [messages])

  const connectWS = () => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setWsStatus("connected")
      ws.send(JSON.stringify({
        type:         "START",
        session_id:   sessionIdRef.current,
        patient_name: patient.name,
        diagnosis:    patient.diagnosis ?? "unknown",
      }))
      setThinking(true)
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {

        case "AGENT_RESPONSE":
          setThinking(false)
          setMessages((prev) => [...prev, {
            role: "bot",
            text: data.text,
          }])
          break

        case "PATIENT_TEXT":
          setLiveTranscript("")
          setMessages((prev) => [...prev, {
            role: "patient",
            text: data.text,
          }])
          setThinking(true)
          break

        case "SUMMARY":
          setSummary(data.content)
          setIsSummarizing(false)
          break

        case "FINAL":
          setWsStatus("stopped")
          break

        case "ERROR":
          console.error("WS Error:", data.code, data.reason)
          setThinking(false)
          break

        default:
          break
      }
    }

    ws.onerror = () => {
      setWsStatus("error")
      setThinking(false)
    }

    ws.onclose = () => {
      if (wsStatus !== "stopped") setWsStatus("idle")
    }
  }

  // Request mic access and start streaming audio chunks
  const startMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        }
      })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, {
        mimeType: "audio/webm;codecs=opus"
      })
      recorderRef.current = recorder

      recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const arrayBuffer = await e.data.arrayBuffer()
          const uint8       = new Uint8Array(arrayBuffer)
          const binary      = uint8.reduce(
            (s, b) => s + String.fromCharCode(b), ""
          )
          const b64 = btoa(binary)

          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({
              type:         "AUDIO_CHUNK",
              session_id:   sessionIdRef.current,
              sequence:     seqRef.current++,
              timestamp_ms: Date.now(),
              audio:        b64,
            }))
          }
        }
      }

      recorder.start(1500)
      setListening(true)
      setLiveTranscript("Listening...")

    } catch (err) {
      alert("Mic permission chahiye — browser settings check karo")
    }
  }

  // Stop mic and clean up audio tracks
  const stopMic = () => {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setListening(false)
    setLiveTranscript("")
  }

  const toggleListening = () => {
    if (thinking || wsStatus !== "connected") return
    if (listening) {
      stopMic()
    } else {
      window.speechSynthesis.cancel()
      startMic()
    }
  }

  // Send summarize request and stop mic
  const handleEndConsultation = () => {
    setIsSummarizing(true)
    stopMic()
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type:       "SUMMARIZE",
        session_id: sessionIdRef.current,
      }))
    }
  }

  if (loading)
    return (
      <div style={{
        display: "flex", justifyContent: "center",
        alignItems: "center", height: "100vh"
      }}>
        <div style={{
          width: "48px", height: "48px",
          border: "5px solid #e0e0e0",
          borderTop: "5px solid #4f46e5",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
        <style>{`
          @keyframes spin {
            0%   { transform: rotate(0deg) }
            100% { transform: rotate(360deg) }
          }
        `}</style>
      </div>
    )

  if (!patient) return null

  return (
    <div className="consultPage">

      {summary && (
        <div className="overlays">
          <div className="summaryPopup">
            <div className="summaryContent">
              {renderText(summary)}
            </div>
            <button
              className="closeBtn"
              onClick={() => setSummary(null)}
            >
              Close & Exit
            </button>
          </div>
        </div>
      )}

      <div className="leftPanel">
        <p className="panelLabel">Patient Profile</p>
        <h1 className="patientName">{patient.name}</h1>
        <div className="divider" />

        <div className="fieldGrid">
          <div className="fieldItem">
            <label>Date of Birth</label>
            <span className="value">
              {patient.dob
                ? new Date(patient.dob).toLocaleDateString()
                : "unknown"}
            </span>
          </div>
          <div className="fieldItem">
            <label>Phone</label>
            <span className="value">{patient.phone || "—"}</span>
          </div>
          <div className="fieldItem">
            <label>Address</label>
            <span className="value">{patient.address || "—"}</span>
          </div>
          <div className="fieldItem">
            <label>Diagnosis</label>
            <span className="diagnosisBadge">{patient.diagnosis}</span>
          </div>
        </div>

        <div className="fieldItem" style={{ marginTop: "1.5rem" }}>
          <label>🔊 Voice Responses</label>
          <button
            onClick={() => {
              setVoiceEnabled((v) => !v)
              window.speechSynthesis.cancel()
            }}
            style={{
              marginTop: "0.4rem", padding: "0.3rem 0.8rem",
              borderRadius: "999px", border: "none", cursor: "pointer",
              background: voiceEnabled ? "#4f46e5" : "#d1d5db",
              color: voiceEnabled ? "#fff" : "#374151",
              fontWeight: 600, fontSize: "0.8rem",
            }}
          >
            {voiceEnabled ? "ON" : "OFF"}
          </button>
        </div>

        <button
          className="endBtn"
          onClick={handleEndConsultation}
          disabled={thinking || isSummarizing}
        >
          {isSummarizing ? "Summarizing..." : "End & Summarize"}
        </button>
      </div>

      <div className="rightPanel">
        <div className="chatHeader">
          <div className="dot" />
          <h2>Consultation with Dr. Medical A</h2>
        </div>

        <div className="chatMessages">
          {messages.length === 0 && !thinking && (
            <p className="emptyChat">Starting your consultation…</p>
          )}

          {messages.map((m, i) => (
            <div key={i} className={`msgRow ${m.role}`}>
              <span className="msgSender">
                {m.role === "patient" ? patient.name : "Dr. Medical A"}
              </span>
              <div className="msgBubble">
                {renderText(m.text)}
              </div>
            </div>
          ))}

          {listening && liveTranscript && (
            <div className="msgRow patient">
              <span className="msgSender">{patient.name}</span>
              <div className="msgBubble"
                style={{ opacity: 0.5, fontStyle: "italic" }}>
                🎤 {liveTranscript}
              </div>
            </div>
          )}

          {thinking && (
            <div className="msgRow bot">
              <span className="msgSender">Dr. Medical A</span>
              <div className="msgBubble"
                style={{ opacity: 0.6, fontStyle: "italic" }}>
                <span style={{ animation: "pulse 1s infinite" }}>
                  Analysing and responding…
                </span>
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="chatInput">

          <button
            onClick={toggleListening}
            disabled={thinking || wsStatus !== "connected"}
            title={listening ? "Stop & send" : "Speak to doctor"}
            style={{
              padding: "0 0.9rem", borderRadius: "8px", border: "none",
              cursor: (thinking || wsStatus !== "connected")
                ? "not-allowed" : "pointer",
              background: listening ? "#ef4444" : "#e0e7ff",
              color:      listening ? "#fff"    : "#4f46e5",
              fontSize: "1.2rem", flexShrink: 0,
              transition: "background 0.2s",
            }}
          >
            {listening ? "⏹" : "🎤"}
          </button>

          <input
            value={liveTranscript || ""}
            onChange={() => {}}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !listening) {
                stopMic()
              }
            }}
            placeholder={
              listening
                ? "🎤 Listening… stop mic to send"
                : wsStatus === "connected"
                ? "Mic dabao aur bolo..."
                : "Connecting to Dr. Medical A..."
            }
            disabled={thinking}
            style={{ fontStyle: listening ? "italic" : "normal" }}
          />

          <input
            id="typeInput"
            style={{ display: listening ? "none" : undefined }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && e.target.value.trim()) {
                e.target.value = ""
              }
            }}
            placeholder="Type your message…"
            disabled={thinking || listening}
          />

          <button
            className="sendBtn"
            onClick={toggleListening}
            disabled={thinking || wsStatus !== "connected"}
          >
            {thinking ? "…" : listening ? "⏹ Send" : "🎤"}
          </button>

        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%,100% { opacity: 1 }
          50%      { opacity: 0.4 }
        }
      `}</style>
    </div>
  )
}