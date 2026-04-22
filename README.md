# 🏰 Escape Room 🔑

משחק חדר בריחה בדפדפן, עם רצפים, מטבעות, חנות סקינים, רמזים, ושיאים עולמיים משותפים.

**תכונות:**
- 🎮 18 חפצים שניתן לחקור — כל משחק רנדומלי
- 🔥 מערכת רצפים (streak) עם טיימר של 2 דקות
- 🪙 מטבעות — הרוויחו על ניצחונות מהירים
- 🛒 חנות עם 7 סקינים של רקע + רמזים בתשלום
- 🏆 טבלת שיאים אישית + עולמית (backend משותף)
- 🌐 תמיכה בעברית ואנגלית (RTL/LTR)
- 🌙 מצב כהה / ☀️ מצב בהיר
- 🎵 מוזיקת רקע + צלילי משחק (Web Audio API)
- 🐱 פרד מוכר את הסקינים

## 🚀 פריסה מהירה (Portainer Stack)

```bash
# בשרת:
git clone https://github.com/USERNAME/escape-room.git
cd escape-room
docker compose up -d --build
```

או ב-Portainer:
1. **Stacks → Add stack**
2. **Build method: Repository** → `https://github.com/USERNAME/escape-room`
3. **Compose path:** `docker-compose.yml`
4. **Deploy the stack**

המשחק יהיה זמין ב-`http://SERVER_IP:8080`

## 🛠 פיתוח מקומי

```bash
npm install
# שים את escape-room.html + fred.jpg בתוך תיקייה בשם public/
mkdir -p public
cp escape-room.html public/index.html
cp fred.jpg public/fred.jpg
npm start
```

ואז פתח `http://localhost:3000`.

## 📁 מבנה הקוד

```
.
├── escape-room.html   # המשחק המלא (HTML/CSS/JS)
├── fred.jpg           # תמונת פרד המוכר
├── server.js          # שרת Express + SQLite ל-API שיאים
├── package.json       # dependencies
├── Dockerfile         # image של Node.js + המשחק
├── docker-compose.yml # pod עם volume ל-DB
└── DEPLOY.md          # הוראות פריסה מפורטות
```

## 📊 API

| Endpoint | Method | תיאור |
|----------|--------|-------|
| `/api/scores` | GET | שליפת 100 השיאים הכי טובים |
| `/api/scores` | POST | שליחת שיא חדש (`{name, time, moves, date}`) |

Rate limit: 60 בקשות לדקה לכל IP.

## 💾 אחסון

SQLite ב-volume מצורף (`escape-room-data`). הנתונים שורדים רידסטרט של הקונטיינר.

## 📜 רישיון

פרויקט אישי. השתמש כרצונך 💛
