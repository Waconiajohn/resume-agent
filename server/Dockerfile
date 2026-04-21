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
# Runtime-read assets (v3 prompts) are bundled into dist/ by the build
# script (see server/package.json: `tsc && cp -r prompts dist/prompts`).
# The loader walks up from its own module location to find
# prompts/_shared/, so no Dockerfile-specific knowledge is required here.

EXPOSE 3001
ENV NODE_ENV=production
ENV PORT=3001

CMD ["node", "dist/index.js"]
