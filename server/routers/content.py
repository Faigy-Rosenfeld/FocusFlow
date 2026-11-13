from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from typing import Literal

from database.connection import get_db
from server.routers.auth import get_current_user
from database import schema as models

router = APIRouter(prefix="/api/content", tags=["content"])


# ── Schemas ──────────────────────────────────────────────────
class ContentCreateRequest(BaseModel):
    title: str
    type: Literal["youtube", "text"]
    source: str


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
