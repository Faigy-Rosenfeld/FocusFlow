# FocusFlow

מערכת למדידת קשב בזמן אמת בזמן לימוד — סרטוני YouTube, מאמרי טקסט וקבצי PDF.  
התוסף מנתח ציוני קשב דרך מצלמת הרשת, מזהה ירידות ריכוז ומציג שאלות הבנה אוטומטיות מבוססות Gemini.

---

## ארכיטקטורה

```
FocusFlow/
├── server/               # FastAPI backend
│   ├── main.py
│   ├── routers/
│   │   ├── auth.py       # הרשמה, התחברות, JWT
│   │   ├── content.py    # ספריית תוכן + העלאת PDF
│   │   ├── sessions.py   # ניהול סשנים וקריאות קשב
│   │   └── gemini.py     # יצירת שאלות הבנה
│   └── requirements.txt
├── database/
│   ├── schema.py         # מודלי SQLAlchemy
│   └── connection.py
├── client/               # React + Vite frontend
│   └── src/
│       ├── pages/        # Login, Register, Library, History, Analytics, Viewer
│       ├── components/   # Navbar, QuizModal, Toast, ConfirmDialog
│       └── api/          # auth, content, sessions, gemini
└── extension/            # Chrome Extension (Manifest V3)
    ├── manifest.json
    ├── panel.js          # לוגיקת ה-side panel
    ├── panel.html
    ├── panel.css
    ├── content.js        # content script בדף
    ├── background.js     # service worker
    ├── popup.html/js     # popup ראשוני
    ├── models/           # מודלי ONNX לניתוח ציוני קשב
    └── lib/              # MediaPipe + onnxruntime-web
```

---

## תכונות עיקריות

**מדידת קשב**
- ניתוח פנים בזמן אמת עם MediaPipe FaceLandmarker (CPU)
- שני מודלי ONNX: מהיר (v1) ועמוק (v4\_2) — מופעלים לפי threshold
- חלון הזזה של 100 פריימים, sliding כל 10 פריימים

**שאלות הבנה אוטומטיות**
- מופעלות לאחר 10 שניות ברצף של קשב נמוך (<0.4)
- מייצרות 8 שאלות בחירה מרובה דרך Gemini
- תומכות בשלושה סוגי מקור: transcript של YouTube, טקסט מאמר, PDF

**ספריית תוכן**
- שמירת סרטוני YouTube, מאמרים ו-PDFים לפי משתמש
- מניעת כפילויות לפי כותרת+סוג
- דילוג אוטומטי על שמירה עבור כתובות localhost

**PDF**
- הורדה בשרת עם `httpx` (עוקפת מגבלות CORS של הדפדפן)
- חילוץ טקסט עם `pypdf`, עד 15,000 תווים

---

## API Endpoints

### Auth — `/api/auth`
| Method | Path | תיאור |
|--------|------|--------|
| POST | `/register` | הרשמה (email, password, display\_name) |
| POST | `/login` | התחברות — מחזיר JWT |
| POST | `/logout` | התנתקות |

### Users — `/api/users`
| Method | Path | תיאור |
|--------|------|--------|
| GET | `/me` | פרטי המשתמש המחובר |
| PATCH | `/me` | עדכון display\_name |
| POST | `/me/password` | שינוי סיסמה |
| DELETE | `/me` | מחיקת חשבון |

### Content — `/api/content`
| Method | Path | תיאור |
|--------|------|--------|
| GET | `/` | רשימת כל פריטי התוכן של המשתמש |
| POST | `/` | יצירת פריט — `{ title, type, source }` |
| GET | `/{id}` | פרטי פריט בודד |
| DELETE | `/{id}` | מחיקת פריט |
| POST | `/upload-pdf` | העלאת PDF כ-multipart — מחלץ טקסט |
| POST | `/upload-pdf-url` | הורדת PDF מ-URL בשרת — מחלץ טקסט, מחזיר `{ id, title, content, type }` |

### Sessions — `/api/sessions`
| Method | Path | תיאור |
|--------|------|--------|
| POST | `/` | פתיחת סשן מקושר לתוכן — `{ content_id }` |
| POST | `/free` | פתיחת סשן חופשי (ללא תוכן) — `{ source_url? }` |
| POST | `/{id}/readings` | הוספת קריאת קשב — `{ position, score }` |
| POST | `/{id}/end` | סיום סשן |
| GET | `/` | רשימת סשנים (pagination) |
| GET | `/analytics` | נתוני אנליטיקה: ממוצע, התפלגות, בסט/וורסט |
| GET | `/{id}` | פרטי סשן + כל הקריאות |

### Gemini — `/api/gemini`
| Method | Path | תיאור |
|--------|------|--------|
| POST | `/questions` | יצירת 8 שאלות הבנה — ראה פירוט למטה |

**גוף הבקשה ל-`/api/gemini/questions`:**
```json
{
  "title": "שם התוכן",
  "video_id": "...",        // אופציונלי — ל-YouTube
  "transcript": [...],      // אופציונלי — רשימת { time, text }
  "content": "...",         // אופציונלי — טקסט מאמר / PDF
  "text": "..."             // אופציונלי — שם חלופי ל-content
}
```
סדר עדיפות: `transcript` → `content` / `text` → כותרת בלבד.

---

## הרצה מקומית

### דרישות מוקדמות
- Python 3.11+
- Node.js 18+
- PostgreSQL

### Backend
```bash
cd server
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

צור קובץ `server/.env`:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/focusflow
SECRET_KEY=your-secret-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.1-flash-lite   # אופציונלי
```

הפעלה:
```bash
uvicorn server.main:app --reload --port 8000
```

### Frontend
```bash
cd client
npm install
npm run dev
```

### תוסף Chrome
1. פתח `chrome://extensions`
2. הפעל **Developer mode**
3. לחץ **Load unpacked** ובחר את תיקיית `extension/`

---

## משתני סביבה

| משתנה | תיאור | ברירת מחדל |
|-------|--------|-------------|
| `DATABASE_URL` | חיבור PostgreSQL | — |
| `SECRET_KEY` | מפתח לחתימת JWT | — |
| `GEMINI_API_KEY` | מפתח Gemini API | — |
| `GEMINI_MODEL` | שם המודל | `gemini-3.1-flash-lite` |

---

## מחסנית טכנולוגית

| שכבה | טכנולוגיה |
|------|-----------|
| Backend | FastAPI, SQLAlchemy, PostgreSQL, httpx, pypdf |
| Frontend | React, Vite |
| Extension | Chrome MV3, MediaPipe, ONNX Runtime Web |
| AI | Google Gemini API |
| Auth | JWT (python-jose), bcrypt |
| Deploy | Google Cloud Run |

---

## מודל הנתונים

```
User
 └── ContentItem (youtube | text)
 └── Session
      ├── content_id → ContentItem (nullable)
      ├── source_url (nullable — סשן חופשי מהתוסף)
      └── Reading[]
           ├── position (שניות)
           └── score (0.0–1.0)
```
