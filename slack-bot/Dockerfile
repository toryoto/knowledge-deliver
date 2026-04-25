FROM oven/bun:1-alpine

WORKDIR /app

COPY package.json ./
RUN bun install

COPY src ./src

ENV NODE_ENV=production
CMD ["bun", "src/index.ts"]
