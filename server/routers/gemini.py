import os
import json
import re
import httpx
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/gemini", tags=["gemini"])

DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"


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
    GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not GEMINI_API_KEY:
        print("Gemini error: GEMINI_API_KEY missing", flush=True)
        return []

    model_name = (os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"

    prompt = build_prompt(req.title, req.transcript)

    async with httpx.AsyncClient(verify=False) as client:
        res = await client.post(
            f"{gemini_url}?key={GEMINI_API_KEY}",
            headers={"Content-Type": "application/json"},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json"},
            },
            timeout=60,
        )

    if not res.is_success:
        print(f"Gemini API HTTP {res.status_code} (model={model_name}): {res.text[:300]}", flush=True)
        return []

    data = res.json()
    raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
    print(f"Gemini ({model_name}) raw response: {raw[:300]}", flush=True)

    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\[[\s\S]*\]", raw)
        if not match:
            return []
        try:
            return json.loads(match.group())
        except Exception as e:
            print(f"Gemini JSON parse error: {e}", flush=True)
            return []
