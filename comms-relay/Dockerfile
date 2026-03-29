FROM oven/bun:1.3-alpine
WORKDIR /app
COPY package.json index.ts ./
COPY public/ ./public/
RUN bun install --production
EXPOSE 4000
CMD ["bun", "run", "index.ts"]
