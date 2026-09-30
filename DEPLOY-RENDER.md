# העלאה ל-GitHub ול-Render

## 1) GitHub

1. https://github.com → **New repository** (למשל `wasender`) — Public או Private  
2. חלץ את ה-ZIP למחשב, פתח טרמינל בתיקייה:

```bash
git init
git add .
git commit -m "wasender deploy"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/wasender.git
git push -u origin main
```

החלף `YOUR_USERNAME` ושם ה-repo.

## 2) Render

1. https://dashboard.render.com — התחבר עם GitHub  
2. **New +** → **Web Service**  
3. בחר את ה-repository `wasender`  
4. מלא:
   - **Name:** wasender  
   - **Language:** Node  
   - **Build Command:** `npm install`  
   - **Start Command:** `npm start`  
   - **Instance type:** Free  
5. **Create Web Service**  
6. חכה ל-Deploy ירוק → לחץ על הכתובת `https://wasender-xxxx.onrender.com`

## 3) שימוש

1. היכנס לאתר  
2. התחבר (אם יש מסך login)  
3. חבר WhatsApp ב-QR  

### חשוב

- בחינם השירות **נרדם** אחרי כ-15 דקות בלי כניסות — הכנס שוב לאתר להעיר  
- אחרי Deploy מחדש ייתכן שצריך לסרוק QR שוב (אין דיסק קבוע ב-Free)
