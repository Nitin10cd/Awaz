from langchain_groq import ChatGroq
from langchain_core.messages import SystemMessage, HumanMessage, AIMessage
from langchain_core.tools import tool
from django.conf import settings
import httpx


@tool
async def tavily_search(query: str) -> str:
    """Search the web for medical articles, medicine info,
    or health resources for the patient."""
    try:
        async with httpx.AsyncClient() as client:
            res = await client.post(
                "https://api.tavily.com/search",
                json={
                    "api_key":        settings.TAVILY_API_KEY,
                    "query":          query,
                    "search_depth":   "basic",
                    "max_results":    3,
                    "include_answer": True,
                },
                timeout=10,
            )
            data = res.json()
            if not data.get("results"):
                return "No results found."
            return "\n\n".join([
                f"• [{r['title']}]({r['url']})\n  {r.get('content','')[:120]}..."
                for r in data["results"]
            ])
    except Exception as e:
        return f"Search unavailable: {e}"


def build_system_prompt(patient_name: str = "the patient",
                        diagnosis: str = "unknown") -> str:
    return f"""You are Dr. Medical A, a highly experienced and compassionate 
medical doctor with 25+ years in clinical practice, internal medicine, 
and patient psychology.

PATIENT DETAILS:
- Name: {patient_name}
- Diagnosis: {diagnosis}

YOUR PERSONALITY & APPROACH:
- Warm, empathetic, and reassuring — patients feel safe talking to you
- You read between the lines — detect anxiety, evasiveness, hidden distress
- You speak like a real doctor — simple language but with medical depth
- You never dismiss concerns, always validate feelings first
- You always greet warmly at the start

EMOTIONAL INTELLIGENCE:
- If patient seems anxious → "I can sense you might be worried — it's okay to share."
- If they use short answers → gently probe: "Take your time — I'm here."
- If in pain or distress → acknowledge before advising

RESPONSE LENGTH RULES:
- Short questions → concise answers
- Serious/emotional concerns → detailed responses  
- Minimum: 10 words | Maximum: 200 words

RESOURCE SHARING:
- Only share links if patient asks OR clearly necessary

CONSULTATION STRUCTURE:
1. Warm greeting using patient's name
2. Assess concern with empathy
3. Ask follow-up questions naturally
4. Clear, actionable medical guidance
5. Close with encouragement like "You're in good hands. 💙"

IMPORTANT: Always respond as Dr. Medical A. Never break character."""


class DoctorAgent:
    """
    LangChain agent that acts as Dr. Medical A.
    Maintains full conversation history per session.
    Uses Groq (llama-3.1-8b-instant) + Tavily search.
    """

    def __init__(self, patient_name: str = "Patient",
                 diagnosis: str = "unknown"):
        self.patient_name = patient_name
        self.diagnosis    = diagnosis

        # Groq LLM with Tavily tool bound
        self.llm = ChatGroq(
            api_key=settings.GROQ_API_KEY,
            model="llama-3.1-8b-instant",
        ).bind_tools([tavily_search])

        # Conversation history grows with each turn
        self.history: list = [
            SystemMessage(content=build_system_prompt(
                patient_name, diagnosis
            ))
        ]

    async def greet(self) -> str:
        """
        Generates the opening greeting from Dr. Medical A.
        Called once when the session starts.
        """
        greet_prompt = HumanMessage(
            content=f"The patient {self.patient_name} has just joined "
                    f"the consultation. Please greet them warmly, introduce "
                    f"yourself as Dr. Medical A, acknowledge their diagnosis "
                    f"of '{self.diagnosis}', and ask how they are feeling today."
        )
        response = await self.llm.ainvoke(self.history + [greet_prompt])
        bot_text = await self._handle_response(response)
        self.history.append(AIMessage(content=bot_text))
        return bot_text

    async def respond(self, patient_text: str) -> str:
        """
        Takes patient speech text and returns Dr. Medical A's response.
        Injects emotional analysis hint before invoking the LLM.
        """
        # Build emotional context from recent patient messages
        recent = [
            m.content for m in self.history
            if isinstance(m, HumanMessage)
        ][-4:]
        emotion_hint = ""
        if recent:
            joined = " | ".join(recent)
            emotion_hint = (
                f"\n\n[Internal note — not visible to patient: "
                f"Based on recent messages: \"{joined}\", "
                f"analyze for emotional cues, evasiveness, "
                f"or hidden distress and respond accordingly.]"
            )

        self.history.append(
            HumanMessage(content=patient_text + emotion_hint)
        )

        response = await self.llm.ainvoke(self.history)
        bot_text = await self._handle_response(response)
        self.history.append(AIMessage(content=bot_text))
        return bot_text

    async def _handle_response(self, response) -> str:
        """
        Handles Tavily tool calls if the LLM requested a web search.
        Appends search results to the response text.
        """
        bot_text = response.content or ""

        if response.tool_calls:
            tool_results = []
            for tc in response.tool_calls:
                if tc["name"] == "tavily_search":
                    result = await tavily_search.ainvoke(tc["args"])
                    tool_results.append(result)

            if tool_results:
                resources = "\n\n".join(tool_results)
                bot_text += f"\n\n📚 **Helpful Resources:**\n{resources}"

        return bot_text

    async def summarize(self) -> str:
        """
        Generates a structured clinical summary at the end of consultation.
        """
        from datetime import date
        summary_prompt = HumanMessage(
            content=f"""The consultation is ending. Generate a structured 
Medical Summary:

## CLINICAL SUMMARY
**Date:** {date.today().strftime("%B %d, %Y")}
**Patient:** {self.patient_name}
**Diagnosis:** {self.diagnosis}

---

### OBSERVATIONS & DISCUSSION
[Bullet points about symptoms and emotional state]

### MEDICAL GUIDANCE
[Specific advice provided]

### NEXT STEPS & ACTIONS
* [Next Step 1]
* [Next Step 2]

---
**Doctor's Note:** [Brief encouraging closing remark]"""
        )
        response = await self.llm.ainvoke(
            self.history + [summary_prompt]
        )
        return response.content or "Summary unavailable."


# In-memory store — one DoctorAgent instance per active session
agents: dict[str, DoctorAgent] = {}