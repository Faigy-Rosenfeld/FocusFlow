from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel

from database.connection import engine, Base, get_db
from routers.auth import get_current_user
from routers import auth, content, sessions
from database import schema as models

from database.schema import User, ContentItem, Session, Reading
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Focus-Flow API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(content.router)
app.include_router(sessions.router)


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
