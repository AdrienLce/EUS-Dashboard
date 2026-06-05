FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build


FROM node:22-alpine AS runner

WORKDIR /app

COPY --from=builder /app/.output ./

# ./data dans nuxt.config.ts est résolu depuis le CWD (/app) → /app/data
VOLUME ["/app/data"]

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["node", "server/index.mjs"]
