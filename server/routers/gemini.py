import os
import json
import re
import httpx
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import Optional

from server.routers.auth import get_current_user
from database import schema as models

router = APIRouter(prefix="/api/gemini", tags=["gemini"])

DEFAULT_GEMINI_MODEL = "gemini-3.1-flash-lite"


class QuestionsRequest(BaseModel):
    video_id: Optional[str] = None
    title: str
    transcript: list | None = None   # רשימת {time, text} — ל-YouTube
    content: str | None = None       # טקסט ישיר — למאמר / PDF
    text: str | None = None          # שם חלופי ל-content (מאמרי טקסט)


def build_prompt(title: str, transcript: list | None, content: str | None, text: str | None = None) -> str:
    # עדיפות: transcript (YouTube) → content → text → כותרת בלבד
    body = content or text
    if transcript:
        limited = transcript[:200]
        source_text = "\n".join(f"[{t['time']}s] {t['text']}" for t in limited)
        source_label = "transcript"
    elif body:
        source_text = body[:12000]
        source_label = "article/document text"
    else:
        source_text = f'Title: "{title}" (no content available)'
        source_label = "title only"

    return f"""You are a focus assistant. Based on the following {source_label}, generate exactly 8 multiple choice comprehension questions.

{source_label.capitalize()}:
{source_text}

IMPORTANT: Return ONLY a valid complete JSON array, no markdown, no explanation, no truncation:
[
  {{
    "time": <integer — seconds offset into the content, or 0 for text articles>,
    "question": "<question about the content>",
    "options": ["<A>", "<B>", "<C>", "<D>"],
    "correct": <0-3 index of correct answer as integer>
  }}
]"""


@router.post("/questions")
async def get_questions(
    req: QuestionsRequest,
    current_user: models.User = Depends(get_current_user),
):
    GEMINI_API_KEY = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not GEMINI_API_KEY:
        return []

    model_name = (os.getenv("GEMINI_MODEL") or DEFAULT_GEMINI_MODEL).strip()
    gemini_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"

    prompt = build_prompt(req.title, req.transcript, req.content, req.text)

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
        return []

    data = res.json()
    raw = data.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")

    try:
        return json.loads(raw)
    except Exception:
        match = re.search(r"\[[\s\S]*\]", raw)
        if not match:
            return []
        try:
            return json.loads(match.group())
        except Exception as e:
            return []
