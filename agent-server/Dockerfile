FROM oven/bun:1-alpine

RUN apk add --no-cache git

WORKDIR /app

COPY package.json ./
RUN bun install

COPY src ./src

ENV NODE_ENV=production
CMD ["bun", "src/index.ts"]
