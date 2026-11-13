import os
import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/gemini", tags=["gemini"])

GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent"


class QuestionsRequest(BaseModel):
    video_id: str
    title: str
    transcript: list | None = None


def build_prompt(title: str, transcript: list | None) -> str:
    if transcript:
        # הגבל transcript ל-200 שורות כדי למנוע חיתוך
        limited = transcript[:200]
        transcript_text = "\n".join(f"[{t['time']}s] {t['text']}" for t in limited)
    else:
        transcript_text = f'Video title: "{title}" (no transcript available, generate questions based on the title)'

    return f"""You are a focus assistant. Based on the following video transcript, generate exactly 8 multiple choice questions spread across different timestamps.

Transcript:
{transcript_text}

IMPORTANT: Return ONLY a valid complete JSON array, no markdown, no explanation, no truncation:
[
  {{
    "time": <seconds into video as integer>,
    "question": "<question about content near that time>",
    "options": ["<A>", "<B>", "<C>", "<D>"],
    "correct": <0-3 index of correct answer as integer>
  }}
]"""


@router.post("/questions")
async def get_questions(req: QuestionsRequest):
    GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
    if not GEMINI_API_KEY:
        return []

    prompt = build_prompt(req.title, req.transcript)

    async with httpx.AsyncClient(verify=False) as client:
        res = await client.post(
            f"{GEMINI_URL}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={"contents": [{"parts": [{"text": prompt}]}]},
            timeout=60,
        )

    if not res.is_success:
        return []

    data = res.json()
    raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    print(f"Gemini raw response: {raw[:300]}", flush=True)

    import json, re
    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\[[\s\S]*\]", raw)
        if not match:
            return []
        try:
            return json.loads(match.group())
        except Exception:
            return []
