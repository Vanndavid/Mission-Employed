# Builds the single-page app and serves it from nginx.
#
# The client lives in frontend/ since the Laravel rebuild split the repo into
# frontend/ and backend/. The build context stays the repo root so this file and
# nginx.conf remain copyable from it.
FROM node:22-alpine AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# GEMINI_API_KEY is deliberately absent here. vite.config.ts inlines
# process.env.GEMINI_API_KEY into the client bundle, so a key present at build
# time would be published to every visitor. Every model call goes through the
# api service instead, which holds the key server-side.
RUN npm run build

FROM nginx:alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
