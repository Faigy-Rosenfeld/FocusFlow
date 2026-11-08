from dotenv import load_dotenv
import os
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))  # server/.env
load_dotenv()  # fallback to root .env

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel

from database.connection import engine, Base, get_db
from server.routers.auth import get_current_user, pwd_context
from server.routers import auth, content, sessions, gemini
from database import schema as models

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Focus-Flow API")

ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:5173",
    "http://localhost:80",
    "http://localhost",
    "http://frontend:80",   # docker-compose service name
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(content.router)
app.include_router(sessions.router)
app.include_router(gemini.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# ── /api/users/me ────────────────────────────────────────────
class UpdateUserRequest(BaseModel):
    display_name: str

@app.get("/api/users/me")
def get_me(current_user: models.User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "display_name": current_user.display_name,
        "created_at": current_user.created_at.isoformat(),
    }

@app.patch("/api/users/me")
def update_me(
    req: UpdateUserRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    current_user.display_name = req.display_name
    db.commit()
    db.refresh(current_user)
    return {"id": current_user.id, "email": current_user.email, "display_name": current_user.display_name}


# ── /api/users/me/password ───────────────────────────────────
class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

@app.post("/api/users/me/password", status_code=204)
def change_password(
    req: ChangePasswordRequest,
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not pwd_context.verify(req.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    if len(req.new_password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")
    current_user.password_hash = pwd_context.hash(req.new_password)
    db.commit()
    return None


# ── DELETE /api/users/me ─────────────────────────────────────
@app.delete("/api/users/me", status_code=204)
def delete_me(
    db: DBSession = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    db.delete(current_user)
    db.commit()
    return None
