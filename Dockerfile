FROM node:20-slim

WORKDIR /app

# Build tools ל-better-sqlite3
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Dependencies (cache-friendly)
COPY package*.json ./
RUN npm install --production && npm cache clean --force

# Server code
COPY server.js ./

# Static files (המשחק + תמונת פרד)
RUN mkdir -p public data
COPY escape-room.html public/index.html
COPY fred.jpg public/fred.jpg

ENV PORT=3000
ENV DB_PATH=/app/data/scores.db

EXPOSE 3000
CMD ["node", "server.js"]
