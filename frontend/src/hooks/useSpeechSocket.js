import { useRef, useState, useCallback } from "react"

const WS_URL = "ws://localhost:8000/ws/speech/"

export function useSpeechSocket() {
  const wsRef  = useRef(null)
  const seqRef = useRef(0)

  const [status,   setStatus]   = useState("idle")
  const [messages, setMessages] = useState([])
  const [summary,  setSummary]  = useState(null)
  const [error,    setError]    = useState(null)

  // Opens WebSocket connection and sends START with patient details
  const connect = useCallback((sessionId, patientName, diagnosis) => {
    const ws = new WebSocket(WS_URL)
    wsRef.current  = ws
    seqRef.current = 0

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type:         "START",
        session_id:   sessionId,
        patient_name: patientName,
        diagnosis:    diagnosis,
      }))
    }

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)

      switch (data.type) {

        case "SESSION_STARTED":
          setStatus("connected")
          break

        case "PATIENT_TEXT":
          setMessages((prev) => [...prev, {
            role: "patient",
            text: data.text,
          }])
          break

        case "AGENT_RESPONSE":
          setMessages((prev) => [...prev, {
            role:       "doctor",
            text:       data.text,
            isGreeting: data.is_greeting || false,
          }])
          break

        case "SUMMARY":
          setSummary(data.content)
          break

        case "FINAL":
          setStatus("stopped")
          break

        case "ERROR":
          setError(`[${data.code}] ${data.reason}`)
          break

        default:
          break
      }
    }

    ws.onerror = () => {
      setStatus("error")
      setError("WebSocket connection failed — server chal raha hai?")
    }

    ws.onclose = () => {
      if (status !== "stopped") setStatus("idle")
    }

  }, [status])

  // Sends a base64 encoded audio chunk to the backend for ASR
  const sendChunk = useCallback((sessionId, audioB64) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return

    wsRef.current.send(JSON.stringify({
      type:         "AUDIO_CHUNK",
      session_id:   sessionId,
      sequence:     seqRef.current++,
      timestamp_ms: Date.now(),
      audio:        audioB64,
    }))
  }, [])

  // Ends the session and triggers final transcript generation
  const stop = useCallback((sessionId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type:       "STOP",
      session_id: sessionId,
      reason:     "user_ended_session",
    }))
  }, [])

  // Requests a clinical summary from the agent
  const requestSummary = useCallback((sessionId) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
    wsRef.current.send(JSON.stringify({
      type:       "SUMMARIZE",
      session_id: sessionId,
    }))
  }, [])

  // Closes connection and resets all state
  const reset = useCallback(() => {
    wsRef.current?.close()
    seqRef.current = 0
    setStatus("idle")
    setMessages([])
    setSummary(null)
    setError(null)
  }, [])

  return {
    connect,
    sendChunk,
    stop,
    requestSummary,
    reset,
    status,
    messages,
    summary,
    error,
  }
}