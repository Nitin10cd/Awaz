import { useRef, useState, useCallback } from "react";

// hook for the audio stream 
export function useAudioStream({onChunk, chunkIntervalMs = 1500}) {

    // for recording and streaming
    const recorderRef = useRef(null);
    const streamRef = useRef(null);

    // checking states
    const [isRecording, setIsRecording] = useState(false);
    const [error,       setError]       = useState(null);
    
    // for start handler 
    const start = useCallback(async () => {
        try {
            setError(null);

        // for taking the mic permission if not there
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                sampleRate: 16000,
            }
        })
        streamRef.current = stream

        // media recorder
        const recorder = new MediaRecorder(stream,{
            mimeType: "audio/webm;codecs=opus"
        })
        recorderRef.current = recorder

        // after chunks gets ready , convert it into the base64
       recorder.ondataavailable = async (e) => {
        if (e.data && e.data.size > 0) {
          const arrayBuffer = await e.data.arrayBuffer()
          const uint8       = new Uint8Array(arrayBuffer)
          const binary      = uint8.reduce(
            (s, b) => s + String.fromCharCode(b), ""
          )
          const b64 = btoa(binary)
          onChunk(b64)
        }
      } 

        recorder.start(chunkIntervalMs)
      setIsRecording(true)

        } catch (error) {
            setError(
        err.name === "NotAllowedError"
          ? "Mic permission denied — browser settings check karo"
          : err.message
      )
        }
    },[onChunk, chunkIntervalMs])
    const stop = useCallback(() => {
    recorderRef.current?.stop()
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setIsRecording(false)
  }, [])

  return { start, stop, isRecording, error }
}