# syntax=docker/dockerfile:1
FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code and build
COPY . .
RUN bun run build

# Production stage
FROM oven/bun:1 AS runner

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package.json bun.lock ./
RUN bun install --production --frozen-lockfile

# Copy built assets from builder
COPY --from=builder /app/dist ./dist

# Expose the default Astro port
EXPOSE 4321

# Start the server
CMD ["bun", "run", "./dist/server/entry.mjs"]
