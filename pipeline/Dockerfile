FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json bun.lock ./
COPY observability ./observability
COPY agent-server ./agent-server
COPY slack-bot ./slack-bot
COPY pipeline ./pipeline

RUN bun install --frozen-lockfile

CMD ["bun", "run", "--filter", "pipeline", "start"]
