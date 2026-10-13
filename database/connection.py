import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

# טעינת המשתנים מקובץ ה-.env
from pathlib import Path
load_dotenv(dotenv_path=Path(__file__).parent.parent / ".env")

DATABASE_URL = os.getenv("DATABASE_URL")

# יצירת מנוע החיבור ל-PostgreSQL
engine = create_engine(DATABASE_URL)

# יצירת מחלקת הסשנים לניהול שאילתות מול מסד הנתונים
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# מחלקת הבסיס עבור המודלים
Base = declarative_base()

# פונקציית עזר לקבלת סשן מסד נתונים עבור נתיבי ה-API
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()