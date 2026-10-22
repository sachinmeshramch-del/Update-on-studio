# Production-ready Dockerfile for Google Cloud Run deployment
FROM node:20-slim AS builder

WORKDIR /app

# Copy root package and lockfile
COPY package.json package-lock.json ./

# Copy all workspace packages
COPY artifacts ./artifacts
COPY lib ./lib
COPY scripts ./scripts
COPY tsconfig.base.json tsconfig.json vite.config.ts index.html ./

# Install all dependencies matching package-lock.json
RUN npm ci

# Run the complete production build (frontend + backend + static asset sync)
RUN npm run build

# Production runtime stage
FROM node:20-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy root package and lockfile
COPY package.json package-lock.json ./

# Copy all node_modules from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy workspace directories and built distributions
COPY --from=builder /app/artifacts ./artifacts
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/dist ./dist

# Expose standard Cloud Run port
EXPOSE 8080

CMD ["npm", "start"]
