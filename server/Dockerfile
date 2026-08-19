FROM mcr.microsoft.com/playwright:v1.49.1-noble

# Pre-build checklist (run from mapimages/ root before docker build / fly deploy):
#   npm run build:render   → server/public/render-lib.iife.js
#   npm run build  (server)→ server/dist/*.js

WORKDIR /app

# Server dependencies
COPY package.json ./
RUN npm install --omit=dev

# Compiled server (TypeScript → JS)
COPY dist/ ./dist/

# Static assets: render.html + render-lib.iife.js (built by npm run build:render)
COPY public/ ./public/

EXPOSE 3001
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
