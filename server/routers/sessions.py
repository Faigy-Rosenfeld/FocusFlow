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
    skip: int = 0,
    limit: int = 10,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    total = db.query(models.Session).filter(models.Session.user_id == current_user.id).count()
    sessions = (
        db.query(models.Session)
        .filter(models.Session.user_id == current_user.id)
        .order_by(models.Session.started_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
    result = []
    for s in sessions:
        scores = [r.score for r in s.readings]
        avg = sum(scores) / len(scores) if scores else 0.0
        result.append({
            "id": s.id,
            "content_id": s.content_id,
            "content_title": s.content_item.title if s.content_item else None,
            "started_at": s.started_at.isoformat(),
            "ended_at": s.ended_at.isoformat() if s.ended_at else None,
            "average_score": round(avg, 3),
        })
    return {"items": result, "total": total, "skip": skip, "limit": limit}


@router.get("/analytics")
def get_analytics(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    sessions = (
        db.query(models.Session)
        .filter(
            models.Session.user_id == current_user.id,
            models.Session.ended_at.isnot(None),
        )
        .order_by(models.Session.started_at.asc())
        .all()
    )

    if not sessions:
        return {
            "total_sessions": 0,
            "total_minutes": 0,
            "overall_avg": None,
            "best_session": None,
            "worst_session": None,
            "sessions_over_time": [],
            "score_distribution": {"high": 0, "mid": 0, "low": 0},
        }

    sessions_over_time = []
    all_avgs = []

    for s in sessions:
        scores = [r.score for r in s.readings]
        if not scores:
            continue
        avg = round(sum(scores) / len(scores), 3)
        duration = round((s.ended_at - s.started_at).total_seconds() / 60, 1)
        all_avgs.append(avg)
        sessions_over_time.append({
            "id": s.id,
            "date": s.started_at.isoformat(),
            "content_title": s.content_item.title if s.content_item else None,
            "average_score": avg,
            "duration_minutes": duration,
        })

    if not all_avgs:
        return {
            "total_sessions": len(sessions),
            "total_minutes": 0,
            "overall_avg": None,
            "best_session": None,
            "worst_session": None,
            "sessions_over_time": [],
            "score_distribution": {"high": 0, "mid": 0, "low": 0},
        }

    overall_avg = round(sum(all_avgs) / len(all_avgs), 3)
    total_minutes = round(sum(s["duration_minutes"] for s in sessions_over_time), 1)

    best = max(sessions_over_time, key=lambda s: s["average_score"])
    worst = min(sessions_over_time, key=lambda s: s["average_score"])

    distribution = {"high": 0, "mid": 0, "low": 0}
    for avg in all_avgs:
        if avg >= 0.7:
            distribution["high"] += 1
        elif avg >= 0.4:
            distribution["mid"] += 1
        else:
            distribution["low"] += 1

    return {
        "total_sessions": len(sessions_over_time),
        "total_minutes": total_minutes,
        "overall_avg": overall_avg,
        "best_session": best,
        "worst_session": worst,
        "sessions_over_time": sessions_over_time,
        "score_distribution": distribution,
    }


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
        "content_title": session.content_item.title if session.content_item else None,
        "started_at": session.started_at.isoformat(),
        "ended_at": session.ended_at.isoformat() if session.ended_at else None,
        "average_score": round(avg, 3),
        "readings": [
            {"position": r.position, "score": r.score, "created_at": r.created_at.isoformat()}
            for r in session.readings
        ],
    }
