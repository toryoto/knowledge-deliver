FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY observability ./observability
COPY agent-server ./agent-server
COPY slack-bot ./slack-bot
COPY pipeline ./pipeline

RUN bun install --frozen-lockfile

ENV NODE_ENV=production
CMD ["bun", "run", "--filter", "slack-bot", "start"]
