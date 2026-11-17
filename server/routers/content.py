from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from typing import Literal, Optional
import io
import httpx

from database.connection import get_db
from server.routers.auth import get_current_user
from database import schema as models

router = APIRouter(prefix="/api/content", tags=["content"])


# ── Schemas ──────────────────────────────────────────────────
class ContentCreateRequest(BaseModel):
    title: str
    type: Literal["youtube", "text"]
    source: str


class PdfUrlRequest(BaseModel):
    url: str
    title: str


# ── Routes ───────────────────────────────────────────────────
@router.post("", status_code=201)
def create_content(
    req: ContentCreateRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if req.type == "youtube" and "youtube.com" not in req.source and "youtu.be" not in req.source:
        raise HTTPException(status_code=422, detail="Invalid YouTube URL")

    item = models.ContentItem(
        user_id=current_user.id,
        title=req.title,
        type=req.type,
        source=req.source,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return {
        "id": item.id,
        "title": item.title,
        "type": item.type,
        "source": item.source,
        "created_at": item.created_at.isoformat(),
    }


@router.get("")
def list_content(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    items = db.query(models.ContentItem).filter(models.ContentItem.user_id == current_user.id).all()
    return [
        {"id": i.id, "title": i.title, "type": i.type, "source": i.source, "created_at": i.created_at.isoformat()}
        for i in items
    ]


@router.get("/{item_id}")
def get_content(
    item_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.ContentItem).filter(
        models.ContentItem.id == item_id,
        models.ContentItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    return {"id": item.id, "title": item.title, "type": item.type, "source": item.source, "created_at": item.created_at.isoformat()}


def _extract_pdf_text(raw_bytes: bytes, max_chars: int = 15_000) -> str:
    """חלץ טקסט מ-bytes של PDF, חתוך ל-max_chars תווים נקיים."""
    try:
        from pypdf import PdfReader
    except ImportError:
        raise HTTPException(status_code=500, detail="pypdf not installed")

    try:
        reader = PdfReader(io.BytesIO(raw_bytes))
    except Exception as e:
        raise HTTPException(status_code=422, detail=f"Could not parse PDF: {e}")

    parts: list[str] = []
    total = 0
    for page in reader.pages:
        if total >= max_chars:
            break
        try:
            page_text = page.extract_text() or ""
        except Exception:
            page_text = ""
        page_text = " ".join(page_text.split())
        remaining = max_chars - total
        parts.append(page_text[:remaining])
        total += min(len(page_text), remaining)

    return " ".join(parts).strip()


def _get_or_create_text_item(db: DBSession, user_id, title: str, extracted: str):
    """מחזיר פריט קיים לפי title+type=text, או יוצר חדש."""
    existing = db.query(models.ContentItem).filter(
        models.ContentItem.user_id == user_id,
        models.ContentItem.title == title,
        models.ContentItem.type == "text",
    ).first()
    if existing:
        return existing

    item = models.ContentItem(
        user_id=user_id,
        title=title,
        type="text",
        source=extracted,
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.post("/upload-pdf", status_code=201)
async def upload_pdf(
    file: UploadFile = File(...),
    title: str = Form(...),
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """קבל קובץ PDF כ-multipart, חלץ טקסט, שמור בספרייה."""
    raw_bytes = await file.read()
    if not raw_bytes:
        raise HTTPException(status_code=422, detail="Empty PDF file")

    extracted = _extract_pdf_text(raw_bytes)
    if not extracted:
        raise HTTPException(status_code=422, detail="No extractable text found in PDF")

    item = _get_or_create_text_item(db, current_user.id, title, extracted)
    return {"id": item.id, "title": item.title, "content": item.source, "type": item.type}


@router.post("/upload-pdf-url", status_code=201)
async def upload_pdf_url(
    req: PdfUrlRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """הורד PDF מ-URL בשרת (עוקף CORS), חלץ טקסט, שמור בספרייה."""
    # בדוק כפילות לפני ההורדה
    existing = db.query(models.ContentItem).filter(
        models.ContentItem.user_id == current_user.id,
        models.ContentItem.title == req.title,
        models.ContentItem.type == "text",
    ).first()
    if existing:
        return {"id": existing.id, "title": existing.title, "content": existing.source, "type": existing.type}

    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=30) as client:
            response = await client.get(req.url, headers={"Accept": "application/pdf,*/*"})
        response.raise_for_status()
        raw_bytes = response.content
    except httpx.HTTPStatusError as e:
        raise HTTPException(status_code=502, detail=f"Failed to download PDF: HTTP {e.response.status_code}")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to download PDF: {e}")

    if not raw_bytes:
        raise HTTPException(status_code=422, detail="Downloaded file is empty")

    extracted = _extract_pdf_text(raw_bytes)
    if not extracted:
        raise HTTPException(status_code=422, detail="No extractable text found in PDF")

    item = _get_or_create_text_item(db, current_user.id, req.title, extracted)
    return {"id": item.id, "title": item.title, "content": item.source, "type": item.type}


@router.delete("/{item_id}", status_code=204)
def delete_content(
    item_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    item = db.query(models.ContentItem).filter(
        models.ContentItem.id == item_id,
        models.ContentItem.user_id == current_user.id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item)
    db.commit()
    return None
