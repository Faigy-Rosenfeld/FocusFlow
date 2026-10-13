from fastapi import FastAPI
from database import engine, Base
import models

# יצירת כל הטבלאות במסד הנתונים בעליית השרת
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Focus-Flow API")

@app.get("/")
def read_root():
    return {"message": "Focus-Flow API is running"}