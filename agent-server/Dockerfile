FROM oven/bun:1-alpine

RUN apk add --no-cache git

WORKDIR /app

# Monorepo root — workspace:* の observability を解決するため全パッケージを同梱
COPY package.json bun.lock ./
COPY observability ./observability
COPY agent-server ./agent-server
COPY slack-bot ./slack-bot
COPY pipeline ./pipeline

RUN bun install --frozen-lockfile

ENV NODE_ENV=production
CMD ["bun", "run", "--filter", "agent-server", "start"]
