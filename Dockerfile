FROM node:20

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Set environment
ENV PORT=8080

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY extensions/launch-checklist-action/package.json ./extensions/launch-checklist-action/
COPY extensions/product-score-block/package.json ./extensions/product-score-block/

# Install ALL dependencies - use npm for native module compatibility
RUN pnpm install --frozen-lockfile

# Force rebuild better-sqlite3 from source
RUN cd node_modules/.pnpm/better-sqlite3@*/node_modules/better-sqlite3 && npm run build-release 2>/dev/null || true
RUN pnpm rebuild better-sqlite3 || true

# Copy source code
COPY . .

# Build the application
ENV NODE_ENV=production
RUN pnpm run build

# Create data directory for SQLite
RUN mkdir -p /app/prisma

EXPOSE 8080

# Run database migrations and start the server
CMD ["sh", "-c", "pnpm run db:push && pnpm run start"]
