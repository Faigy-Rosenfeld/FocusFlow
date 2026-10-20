import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

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