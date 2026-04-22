# 🚀 הוראות פריסה

## אופציה 1 — Portainer Stack מ-Git (הכי פשוט)

לאחר שתעלה את ה-repo ל-GitHub:

1. פתח Portainer: `http://192.168.1.200:9000`
2. **Stacks → + Add stack**
3. **Name:** `escape-room`
4. **Build method:** בחר **Repository**
5. **Repository URL:** `https://github.com/USERNAME/escape-room` (החלף ל-URL שלך)
6. **Compose path:** `docker-compose.yml`
7. **Deploy the stack** 🚀

Portainer יבנה את ה-image לבד ויריץ אותו.

המשחק יהיה זמין ב-**`http://192.168.1.200:8080`**

## אופציה 2 — העתקה ידנית לשרת

```bash
# בשרת:
cd /opt/
git clone https://github.com/USERNAME/escape-room.git
cd escape-room
docker compose up -d --build
```

## 🌐 גישה מחוץ לרשת הביתית

רוצה שחברים מחוץ לבית יוכלו לשחק? 3 אפשרויות:

### 1. Port forwarding בראוטר (פשוט, פחות בטוח)
- פתח בראוטר: `8080 → 192.168.1.200:8080`
- שתף את ה-IP הציבורי שלך: `http://YOUR_PUBLIC_IP:8080`

### 2. Cloudflare Tunnel (מומלץ — חינם ובטוח)
```bash
# התקן cloudflared
# ואז:
cloudflared tunnel --url http://192.168.1.200:8080
```
תקבל כתובת ציבורית מאובטחת ב-`*.trycloudflare.com`

### 3. Tailscale (VPN פרטי)
רק חברים שמתחברים ל-Tailscale שלך יוכלו לגשת.

## 🔄 עדכון המשחק

אחרי `git push` של שינויים ל-GitHub:

ב-Portainer → **Stacks → escape-room → Pull and redeploy** 🔄

## 📊 גיבוי שיאים

הנתונים נמצאים ב-Docker volume `escape-room-data`. לגבוי:

```bash
# גיבוי:
docker run --rm -v escape-room-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/scores-backup.tar.gz -C /data .

# שחזור:
docker run --rm -v escape-room-data:/data -v $(pwd):/backup alpine \
  tar xzf /backup/scores-backup.tar.gz -C /data
```

## 🐛 בעיות נפוצות

**התמונה של פרד לא נטענת** → ודא ש-`fred.jpg` נמצא באותה תיקייה עם Dockerfile.

**Port 8080 תפוס** → שנה את ה-mapping ב-`docker-compose.yml`:
```yaml
ports:
  - "9090:3000"  # במקום 8080
```

**שיאים לא נשמרים** → בדוק ש-volume `escape-room-data` קיים:
```bash
docker volume ls | grep escape-room
```
