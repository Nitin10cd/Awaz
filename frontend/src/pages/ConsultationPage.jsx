import { useState, useRef, useEffect } from "react"
import { useNavigate } from "react-router-dom" // Added for redirection
import { usePatient } from "../context/PatientContext"
import { ChatGroq } from "@langchain/groq"
import { HumanMessage, SystemMessage, AIMessage } from "@langchain/core/messages"
import { tool } from "@langchain/core/tools"
import { z } from "zod"


//  CONFIG 
const GROQ_API_KEY = "GROQ_API"
const TAVILY_API_KEY = "TAVILY_API"

//  Tavily Search Tool 
const tavilySearch = tool(
  async ({ query }) => {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: TAVILY_API_KEY,
          query,
          search_depth: "basic",
          max_results: 3,
          include_answer: true,
        }),
      })
      const data = await res.json()
      if (!data.results) return "No results found."
      return data.results
        .map((r) => `• [${r.title}](${r.url})\n  ${r.content?.slice(0, 120)}...`)
        .join("\n\n")
    } catch (e) {
      return "Search unavailable right now."
    }
  },
  {
    name: "tavily_search",
    description:
      "Search the web for medical articles, medicine info, health resources, or helpful links for the patient.",
    schema: z.object({
      query: z.string().describe("The search query"),
    }),
  }
)

// LangChain Groq client with tool
const chat = new ChatGroq({
  apiKey: GROQ_API_KEY,
  model: "llama-3.1-8b-instant",
}).bindTools([tavilySearch])

//  Browser TTS 
function speakText(text) {
  const clean = text.replace(/\[.*?\]\(.*?\)/g, "").replace(/[*_#`]/g, "")
  const utterance = new SpeechSynthesisUtterance(clean)
  utterance.lang = "en-US"
  utterance.rate = 0.95
  utterance.pitch = 1
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

// System Prompt 
function buildSystemPrompt(patient) {
  return `You are Dr. Medical A, a highly experienced and compassionate medical doctor with 25+ years in clinical practice, internal medicine, and patient psychology. You have deep expertise in diagnosing, treating, and emotionally supporting patients.

PATIENT DETAILS:
- Name: ${patient?.name ?? "the patient"}
- Diagnosis: ${patient?.diagnosis ?? "unknown"}
- DOB: ${patient?.dob ?? "unknown"}
- Address: ${patient?.address ?? "unknown"}

YOUR PERSONALITY & APPROACH:
- Warm, empathetic, and reassuring — patients feel safe talking to you
- You read between the lines. If a patient seems to be hiding something, downplaying symptoms, or is emotionally distressed, you gently acknowledge it and create a safe space
- You analyze the FULL conversation history to detect patterns, emotional shifts, or inconsistencies
- You speak like a real doctor — use simple language but with medical depth
- You never dismiss concerns, always validate feelings first before giving medical advice
- You always greet warmly at the start and sign off with encouragement

EMOTIONAL INTELLIGENCE:
- If the patient seems anxious, scared, or vague → say "I can sense you might be worried about something — it's completely okay to share anything with me."
- If they use short or evasive answers → gently probe: "Sometimes it's hard to put things into words. Take your time — I'm here."
- If they seem in pain or distress → acknowledge before advising
- Mirror their emotional tone — match calmness to calm, warmth to distress

RESPONSE LENGTH RULES:
- Adapt response length to user message complexity, urgency, and emotional state
- Short/simple questions → concise answers
- Serious, complex, or emotional concerns → more detailed responses
- Minimum length: 10 words
- Maximum length: 200 words
- Never be unnecessarily long or overly brief

RESOURCE SHARING POLICY:
- Only provide medical links or references IF:
  • the patient asks for them, OR
  • they are clearly necessary for treatment, safety, or understanding
- Do NOT include links routinely or automatically

CONSULTATION STRUCTURE:
1. Begin with a warm greeting using the patient's name
2. Assess their concern with empathy
3. Ask follow-up questions naturally (not all at once)
4. Provide clear, actionable medical guidance
5. Include resources only if required (per policy above)
6. Close every response with an encouraging sign-off like "You're in good hands. 💙"

IMPORTANT:
You must always respond as Dr.Medical A.
Never break character.
Never say you're an AI.`;
}

export default function ConsultationPage() {
  const { patient, fetchU, loading } = usePatient()
  const navigate = useNavigate() 
  const [messages, setMessages] = useState([])
  const [thinking, setThinking] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [listening, setListening] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState("")
  const bottomRef = useRef(null)
  const history = useRef([])
  const recognitionRef = useRef(null)
  const hasGreeted = useRef(false)

  const [summary, setSummary] = useState(null);
const [isSummarizing, setIsSummarizing] = useState(false);

const handleEndConsultation = async () => {
  setIsSummarizing(true);
  try {
    const summaryMsg = new HumanMessage(
      `The consultation is ending. Generate a structured Medical Summary using the following format:
      
      ## CLINICAL SUMMARY
      **Date:** ${new Date().toLocaleDateString()}
      **Patient:** ${patient?.name}
      **Diagnosis:** ${patient?.diagnosis}
      
      ---
      
      ### OBSERVATIONS & DISCUSSION
      [Bullet points about the patient's symptoms and emotional state]
      
      ### MEDICAL GUIDANCE
      [Specific advice provided during the session]
      
      ### NEXT STEPS & ACTIONS
      * [Next Step 1]
      * [Next Step 2]
      
      ---
      **Doctor's Note:** [A brief closing encouraging remark]
      
      Please use Markdown for bolding and headers.`
    );
    const response = await chat.invoke([...history.current, summaryMsg]);
    setSummary(response.content);
  } catch (e) {
    setSummary("Error generating clinical record.");
  } finally {
    setIsSummarizing(false);
  }
};

  // Redirect if no patient exists after loading is complete
  useEffect(() => {
    if (!loading && !patient) {
      navigate("/patient")
    }
  }, [loading, patient, navigate])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, thinking])

  //  Initial greeting 
  useEffect(() => {
    if (!loading && patient && !hasGreeted.current) {
      hasGreeted.current = true
      triggerGreeting()
    }
    
  }, [loading, patient])

  const triggerGreeting = async () => {
    setThinking(true)
    try {
      const sysMsg = new SystemMessage(buildSystemPrompt(patient))
      const greetMsg = new HumanMessage(
        `The patient ${patient?.name ?? "patient"} has just joined the consultation. Please greet them warmly, introduce yourself as Dr. Medical A, acknowledge their diagnosis of "${patient?.diagnosis ?? "their condition"}", and ask how they are feeling today. Be warm and human.`
      )
      history.current = [sysMsg]
      const response = await chat.invoke([sysMsg, greetMsg])
      const botText = response.content
      history.current.push(new AIMessage(botText))
      setMessages([{ role: "bot", text: botText }])
      if (voiceEnabled) speakText(botText)
    } catch (e) {
      console.error("Greeting error:", e)
    } finally {
      setThinking(false)
    }
  }

  useEffect(() => {
    fetchU?.()
  }, [])

  //  Speech Recognition 
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = "en-US"
    recognition.interimResults = true
    recognition.continuous = true

    recognition.onresult = (event) => {
      let interim = ""
      let final = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) final += t
        else interim += t
      }
      setLiveTranscript(interim || final)
      if (final) {
        setLiveTranscript("")
        recognition.stop()
        setListening(false)
        sendMessage(final.trim())
      }
    }

    recognition.onerror = (e) => {
      console.error("STT error:", e.error)
      setListening(false)
      setLiveTranscript("")
    }

    recognition.onend = () => {
      setListening(false)
    }

    recognitionRef.current = recognition
  }, [])

  const toggleListening = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition not supported in this browser.")
      return
    }
    if (listening) {
      recognitionRef.current.stop()
      setListening(false)
      setLiveTranscript("")
    } else {
      window.speechSynthesis.cancel()
      recognitionRef.current.start()
      setListening(true)
    }
  }

  // Send Message 
  const sendMessage = async (text) => {
    if (!text?.trim() || thinking) return

    setMessages((prev) => [...prev, { role: "patient", text }])
    setThinking(true)

    try {
      if (history.current.length === 0) {
        history.current.push(new SystemMessage(buildSystemPrompt(patient)))
      }

      // Emotional analysis injection
      const recentTexts = history.current
        .filter((m) => m._getType?.() === "human")
        .slice(-4)
        .map((m) => m.content)
        .join(" | ")

      const emotionHint =
        recentTexts.length > 0
          ? `\n\n[Internal note — not visible to patient: Based on recent messages: "${recentTexts}", analyze for emotional cues, evasiveness, or hidden distress and respond accordingly.]`
          : ""

      history.current.push(new HumanMessage(text + emotionHint))

      const response = await chat.invoke(history.current)

      // Handle tool calls
      let botText = response.content
      if (response.tool_calls?.length > 0) {
        const toolResults = await Promise.all(
          response.tool_calls.map(async (tc) => {
            if (tc.name === "tavily_search") {
              return await tavilySearch.invoke(tc.args)
            }
            return ""
          })
        )
        const resourceBlock = toolResults.filter(Boolean).join("\n\n")
        if (resourceBlock) {
          botText += `\n\n📚 **Helpful Resources:**\n${resourceBlock}`
        }
      }

      history.current.push(new AIMessage(botText))
      setMessages((prev) => [...prev, { role: "bot", text: botText }])
      if (voiceEnabled) speakText(botText)
    } catch (err) {
      console.error("Groq error:", err)
      setMessages((prev) => [
        ...prev,
        { role: "bot", text: "I apologize, I'm having a technical issue. Please try again." },
      ])
    } finally {
      setThinking(false)
    }
  }

  //  Render message text with basic markdown links 
  const renderText = (text) => {
  if (!text) return null;

  // Split by new lines to process line by line
  return text.split("\n").map((line, i) => {
    if (line.trim() === "---") {
      return <hr key={i} className="summaryHr" />;
    }
    if (line.startsWith("##")) {
      const cleanHeader = line.replace(/^#+\s*/, "");
      return <h3 key={i} className="summaryH3">{cleanHeader}</h3>;
    }

    const parts = line.split(/(\*\*.*?\*\*|\[.*?\]\(.*?\))/g);
    
    const formattedLine = parts.map((part, j) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return <strong key={j}>{part.slice(2, -2)}</strong>;
      }
      const linkMatch = part.match(/\[(.*?)\]\((.*?)\)/);
      if (linkMatch) {
        return (
          <a key={j} href={linkMatch[2]} target="_blank" rel="noreferrer" className="summaryLink">
            {linkMatch[1]}
          </a>
        );
      }
      return part;
    });

    return <div key={i} className="summaryLine">{formattedLine}</div>;
  });
};

  if (loading)
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh" }}>
        <div style={{
          width: "48px", height: "48px",
          border: "5px solid #e0e0e0", borderTop: "5px solid #4f46e5",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        <style>{`@keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }`}</style>
      </div>
    )

  if (!patient) return null 

  return (
    <div className="consultPage">
      {summary && (
  <div className="overlays">
    <div className="summaryPopup">
      <div className="summaryContent">{renderText(summary)}</div>
      <button className="closeBtn" onClick={() => setSummary(null)}>Close & Exit</button>
    </div>
  </div>
)}
      {/* LEFT — patient info */}
      <div className="leftPanel">
        <p className="panelLabel">Patient Profile</p>
        <h1 className="patientName">{patient.name}</h1>
        <div className="divider" />
        <div className="fieldGrid">
          <div className="fieldItem"><label>Date of Birth</label><span className="value">{patient.dob ? new Date(patient.dob).toLocaleDateString() : "unknown"}</span></div>
          <div className="fieldItem"><label>Phone</label><span className="value">{patient.phone}</span></div>
          <div className="fieldItem"><label>Address</label><span className="value">{patient.address}</span></div>
          <div className="fieldItem"><label>Diagnosis</label><span className="diagnosisBadge">{patient.diagnosis}</span></div>
        </div>

        <div className="fieldItem" style={{ marginTop: "1.5rem" }}>
          <label>🔊 Voice Responses</label>
          <button
            onClick={() => { setVoiceEnabled((v) => !v); window.speechSynthesis.cancel() }}
            style={{
              marginTop: "0.4rem", padding: "0.3rem 0.8rem", borderRadius: "999px",
              border: "none", cursor: "pointer",
              background: voiceEnabled ? "#4f46e5" : "#d1d5db",
              color: voiceEnabled ? "#fff" : "#374151",
              fontWeight: 600, fontSize: "0.8rem",
            }}
          >{voiceEnabled ? "ON" : "OFF"}</button>
        </div>

        <button className="endBtn" onClick={handleEndConsultation} disabled={thinking || isSummarizing}>
  {isSummarizing ? "Summarizing..." : "End & Summarize"}
</button>
      </div>

      {/* RIGHT — chat */}
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
              <span className="msgSender">{m.role === "patient" ? patient.name : "Dr. Medical A"}</span>
              <div className="msgBubble">{renderText(m.text)}</div>
            </div>
          ))}

          {/* Live transcript bubble */}
          {listening && liveTranscript && (
            <div className="msgRow patient">
              <span className="msgSender">{patient.name}</span>
              <div className="msgBubble" style={{ opacity: 0.5, fontStyle: "italic" }}>
                🎤 {liveTranscript}
              </div>
            </div>
          )}

          {thinking && (
            <div className="msgRow bot">
              <span className="msgSender">Dr. Medical A</span>
              <div className="msgBubble" style={{ opacity: 0.6, fontStyle: "italic" }}>
                <span style={{ animation: "pulse 1s infinite" }}>Analysing and responding…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="chatInput">
          {/* 🎤 Mic — auto-sends on stop */}
          <button
            onClick={toggleListening}
            disabled={thinking}
            title={listening ? "Stop & send" : "Speak to doctor"}
            style={{
              padding: "0 0.9rem", borderRadius: "8px", border: "none",
              cursor: thinking ? "not-allowed" : "pointer",
              background: listening ? "#ef4444" : "#e0e7ff",
              color: listening ? "#fff" : "#4f46e5",
              fontSize: "1.2rem", flexShrink: 0, transition: "background 0.2s",
            }}
          >{listening ? "⏹" : "🎤"}</button>

          <input
            value={liveTranscript || ""}
            onChange={() => {}}
            onKeyDown={(e) => { if (e.key === "Enter" && !listening) sendMessage(e.target.value) }}
            placeholder={listening ? "🎤 Listening… stop mic to send" : "Type your message…"}
            disabled={thinking}
            style={{ fontStyle: listening ? "italic" : "normal" }}
          />

          {/* Type input — separate hidden input for typing */}
          <input
            id="typeInput"
            style={{ display: listening ? "none" : undefined }}
            onKeyDown={(e) => { if (e.key === "Enter") { sendMessage(e.target.value); e.target.value = "" } }}
            placeholder="Type your message…"
            disabled={thinking || listening}
          />

          <button
            className="sendBtn"
            onClick={() => {
              const el = document.getElementById("typeInput")
              if (el?.value) { sendMessage(el.value); el.value = "" }
            }}
            disabled={thinking || listening}
          >{thinking ? "…" : "Send"}</button>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }`}</style>
    </div>
  )
}