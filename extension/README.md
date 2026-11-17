# FocusFlow Chrome Extension

תוסף כרום שמודד קשב בזמן לימוד בכל דף אינטרנט.

## התקנה

1. העתק את קבצי המודלים:
   ```
   cp client/public/models/v1.onnx extension/models/
   cp client/public/models/v4_2.onnx extension/models/
   ```

2. פתח Chrome → `chrome://extensions`
3. הפעל "Developer mode" (מצב מפתח) בפינה הימנית העליונה
4. לחץ "Load unpacked" (טען לא ארוז)
5. בחר את תיקיית `extension/`

## שימוש

1. לחץ על אייקון FocusFlow בסרגל הכלים
2. התחבר עם פרטי החשבון שלך
3. נווט לדף שרוצה ללמוד ממנו
4. לחץ "התחל מדידת קשב"
5. אשר גישה למצלמה
6. הציון יתעדכן כל שנייה
7. לחץ "סיים" בסיום
