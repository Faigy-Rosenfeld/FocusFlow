from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel
from datetime import datetime

from database.connection import get_db
from server.routers.auth import get_current_user
from database import schema as models

router = APIRouter(prefix="/api/sessions", tags=["sessions"])


# ── Schemas ──────────────────────────────────────────────────
class SessionCreateRequest(BaseModel):
    content_id: str

class ReadingCreateRequest(BaseModel):
    position: float
    score: float


# ── Routes ───────────────────────────────────────────────────
@router.post("", status_code=201)
def create_session(
    req: SessionCreateRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    content = db.query(models.ContentItem).filter(
        models.ContentItem.id == req.content_id,
        models.ContentItem.user_id == current_user.id,
    ).first()
    if not content:
        raise HTTPException(status_code=404, detail="Content not found")

    session = models.Session(user_id=current_user.id, content_id=req.content_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "content_id": session.content_id, "started_at": session.started_at.isoformat()}


@router.post("/{session_id}/readings", status_code=201)
def add_reading(
    session_id: str,
    req: ReadingCreateRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = db.query(models.Session).filter(
        models.Session.id == session_id,
        models.Session.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    if session.ended_at:
        raise HTTPException(status_code=409, detail="Session already ended")
    if not (0.0 <= req.score <= 1.0):
        raise HTTPException(status_code=422, detail="Score must be between 0 and 1")

    reading = models.Reading(session_id=session_id, position=req.position, score=req.score)
    db.add(reading)
    db.commit()
    db.refresh(reading)
    return {"id": reading.id, "position": reading.position, "score": reading.score, "created_at": reading.created_at.isoformat()}


@router.post("/{session_id}/end")
def end_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = db.query(models.Session).filter(
        models.Session.id == session_id,
        models.Session.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.ended_at = datetime.utcnow()
    db.commit()
    db.refresh(session)

    scores = [r.score for r in session.readings]
    avg = sum(scores) / len(scores) if scores else 0.0

    return {
        "id": session.id,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat(),
        "reading_count": len(scores),
        "average_score": round(avg, 3),
    }


@router.get("")
def list_sessions(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sessions = db.query(models.Session).filter(models.Session.user_id == current_user.id).all()
    result = []
    for s in sessions:
        scores = [r.score for r in s.readings]
        avg = sum(scores) / len(scores) if scores else 0.0
        result.append({
            "id": s.id,
            "content_id": s.content_id,
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "average_score": round(avg, 3),
        })
    return result


@router.get("/{session_id}")
def get_session(
    session_id: str,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    session = db.query(models.Session).filter(
        models.Session.id == session_id,
        models.Session.user_id == current_user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    scores = [r.score for r in session.readings]
    avg = sum(scores) / len(scores) if scores else 0.0

    return {
        "id": session.id,
        "content_id": session.content_id,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "average_score": round(avg, 3),
        "readings": [
            {"position": r.position, "score": r.score, "created_at": r.created_at.isoformat()}
            for r in session.readings
        ],
    }
