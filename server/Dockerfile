# --- Build stage --------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Production stage ---------------------------------------------------------
FROM node:20-alpine

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/dist ./dist
# v3 pipeline prompts live outside dist/ (they're .md files, not compiled TS)
# and are read at runtime by server/src/v3/prompts/loader.ts via a path
# resolved relative to the compiled JS (../../../prompts from dist/v3/prompts/
# → /app/prompts). Missing this copy made classify/strategize/verify/write
# throw PromptLoadError on first request in production. 2026-04-20.
COPY --from=builder /app/prompts ./prompts

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
