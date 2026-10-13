from sqlalchemy import Column, String, Float, DateTime, ForeignKey, Text, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from database.connection import Base


def generate_uuid():
    return str(uuid.uuid4())


class ContentType(str, enum.Enum):
    youtube = "youtube"
    text = "text"


# ================================
# Users
# ================================

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=generate_uuid)
    email = Column(String, unique=True, index=True, nullable=False)
    display_name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    content_items = relationship("ContentItem", back_populates="owner", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="owner", cascade="all, delete-orphan")


# ================================
# Content
# ================================

class ContentItem(Base):
    __tablename__ = "content_items"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    type = Column(Enum(ContentType), nullable=False)
    source = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    owner = relationship("User", back_populates="content_items")
    sessions = relationship("Session", back_populates="content_item")


# ================================
# Sessions & Readings
# ================================

class Session(Base):
    __tablename__ = "sessions"

    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    content_id = Column(String, ForeignKey("content_items.id"), nullable=False)
    started_at = Column(DateTime, default=datetime.utcnow)
    ended_at = Column(DateTime, nullable=True)

    owner = relationship("User", back_populates="sessions")
    content_item = relationship("ContentItem", back_populates="sessions")
    readings = relationship("Reading", back_populates="session", cascade="all, delete-orphan")


class Reading(Base):
    __tablename__ = "readings"

    id = Column(String, primary_key=True, default=generate_uuid)
    session_id = Column(String, ForeignKey("sessions.id"), nullable=False)
    position = Column(Float, nullable=False)
    score = Column(Float, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    session = relationship("Session", back_populates="readings")
