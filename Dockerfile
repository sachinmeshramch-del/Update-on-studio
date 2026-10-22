# Production-ready Dockerfile for Google Cloud Run deployment
FROM node:20-slim AS builder

WORKDIR /app

# Copy root package and lockfile
COPY package.json package-lock.json ./

# Copy all workspace packages so npm workspaces resolve accurately
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
COPY artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY artifacts/gold-swing-ai/package.json ./artifacts/gold-swing-ai/package.json
COPY lib/api-client-react/package.json ./lib/api-client-react/package.json
COPY lib/api-spec/package.json ./lib/api-spec/package.json
COPY lib/api-zod/package.json ./lib/api-zod/package.json
COPY lib/db/package.json ./lib/db/package.json

# Install production dependencies
RUN npm ci --omit=dev

# Copy compiled bundles and distribution assets from builder
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/artifacts/gold-swing-ai/dist ./artifacts/gold-swing-ai/dist

# Expose standard Cloud Run port
EXPOSE 8080

CMD ["npm", "start"]
