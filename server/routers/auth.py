from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session as DBSession
from pydantic import BaseModel, EmailStr
from datetime import datetime, timedelta
from jose import JWTError, jwt
from passlib.context import CryptContext
from collections import defaultdict
import time
import os

from database.connection import get_db
from database import schema as models

router = APIRouter(prefix="/api/auth", tags=["auth"])

# ── Security setup ──────────────────────────────────────────
SECRET_KEY = os.getenv("JWT_SECRET", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

# ── Login rate limiting ─────────────────────────────────────
MAX_ATTEMPTS = 5
LOCKOUT_SECONDS = 15 * 60  # 15 minutes

# { email: {"attempts": int, "locked_until": float | None} }
_login_attempts: dict = defaultdict(lambda: {"attempts": 0, "locked_until": None})


def _check_rate_limit(email: str):
    record = _login_attempts[email]
    now = time.time()
    if record["locked_until"] and now < record["locked_until"]:
        remaining = int(record["locked_until"] - now)
        minutes = remaining // 60
        seconds = remaining % 60
        raise HTTPException(
            status_code=429,
            detail=f"יותר מדי ניסיונות כושלים. נסי שוב בעוד {minutes}:{seconds:02d} דקות.",
        )
    if record["locked_until"] and now >= record["locked_until"]:
        _login_attempts[email] = {"attempts": 0, "locked_until": None}


def _record_failed(email: str):
    record = _login_attempts[email]
    record["attempts"] += 1
    if record["attempts"] >= MAX_ATTEMPTS:
        record["locked_until"] = time.time() + LOCKOUT_SECONDS


def _reset_attempts(email: str):
    _login_attempts[email] = {"attempts": 0, "locked_until": None}


# ── Schemas ──────────────────────────────────────────────────
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    display_name: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


# ── Helpers ──────────────────────────────────────────────────
def validate_password(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=422, detail="הסיסמה חייבת להכיל לפחות 8 תווים.")
    if not any(c.isdigit() for c in password):
        raise HTTPException(status_code=422, detail="הסיסמה חייבת להכיל לפחות ספרה אחת.")
    if not any(c.isupper() for c in password):
        raise HTTPException(status_code=422, detail="הסיסמה חייבת להכיל לפחות אות גדולה אחת באנגלית.")


# ── Helpers ──────────────────────────────────────────────────
def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: DBSession = Depends(get_db)) -> models.User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    user = db.query(models.User).filter(models.User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# ── Routes ───────────────────────────────────────────────────
@router.post("/register", status_code=201)
def register(req: RegisterRequest, db: DBSession = Depends(get_db)):
    validate_password(req.password)

    if db.query(models.User).filter(models.User.email == req.email.lower()).first():
        raise HTTPException(status_code=409, detail="Email already registered")

    user = models.User(
        email=req.email.lower(),
        display_name=req.display_name,
        password_hash=pwd_context.hash(req.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {"id": user.id, "email": user.email, "display_name": user.display_name}


@router.post("/login")
def login(req: LoginRequest, db: DBSession = Depends(get_db)):
    _check_rate_limit(req.email.lower())

    user = db.query(models.User).filter(models.User.email == req.email.lower()).first()
    if not user or not pwd_context.verify(req.password, user.password_hash):
        _record_failed(req.email.lower())
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _reset_attempts(req.email.lower())
    token = create_access_token(user.id)
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_MINUTES * 60,
    }


@router.post("/logout", status_code=204)
def logout(_: models.User = Depends(get_current_user)):
    return None
