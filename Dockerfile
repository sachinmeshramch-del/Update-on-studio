# Multi-stage Dockerfile for Google Cloud Run deployment
# Stage 1: Build Stage (compile frontend Vite assets & backend server bundle)
FROM node:22-slim AS builder

WORKDIR /app

# Install system utilities needed for building native dependencies if any
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy root npm configuration & package manifests for optimal layer caching
COPY package*.json .npmrc* ./
COPY artifacts/api-server/package*.json ./artifacts/api-server/
COPY artifacts/gold-swing-ai/package*.json ./artifacts/gold-swing-ai/
COPY lib/api-client-react/package*.json ./lib/api-client-react/
COPY lib/api-spec/package*.json ./lib/api-spec/
COPY lib/api-zod/package*.json ./lib/api-zod/
COPY lib/db/package*.json ./lib/db/

# Install full dependencies (including devDependencies needed for compiling TypeScript/Vite)
RUN npm install --legacy-peer-deps --no-audit --no-fund

# Copy source code across all monorepo workspaces
COPY . .

# Build both frontend static assets and backend production bundle
ENV NODE_ENV=production
RUN npm run build

# ==============================================================================
# Stage 2: Production Dependencies (clean, isolated production node_modules)
# ==============================================================================
FROM node:22-slim AS prod-deps

WORKDIR /app

# Copy root npm config and workspace package manifests + internal libraries
COPY package*.json .npmrc* ./
COPY artifacts/api-server/package*.json ./artifacts/api-server/
COPY artifacts/gold-swing-ai/package*.json ./artifacts/gold-swing-ai/
COPY lib/ ./lib/

# Install ONLY production dependencies (pruning devDependencies to prevent status code 51 / OOM)
RUN npm install --omit=dev --legacy-peer-deps --no-audit --no-fund --ignore-scripts && \
    npm cache clean --force

# ==============================================================================
# Stage 3: Minimal Production Runtime Container for Google Cloud Run
# ==============================================================================
FROM node:22-slim AS runner

WORKDIR /app

# Cloud Run sets PORT environment variable (default: 8080)
ENV NODE_ENV=production
ENV PORT=8080

# Install runtime SSL/TLS certificates for external MetaApi and Firebase secure connections
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*

# Copy production dependencies and workspace package references
COPY --from=prod-deps /app/package*.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/artifacts/api-server/package*.json ./artifacts/api-server/package.json
COPY --from=prod-deps /app/artifacts/gold-swing-ai/package*.json ./artifacts/gold-swing-ai/package.json
COPY --from=prod-deps /app/lib ./lib

# Copy compiled backend bundle and static frontend assets from builder stage
COPY --from=builder /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/gold-swing-ai/dist ./artifacts/gold-swing-ai/dist
COPY --from=builder /app/dist ./dist

# Copy optional Firebase applet configuration if present
COPY firebase-applet-config.json* ./

# Explicitly expose port 8080 for Google Cloud Run container contract
EXPOSE 8080

# Launch production server with source maps enabled
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
