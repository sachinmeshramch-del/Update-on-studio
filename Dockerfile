# Multi-stage Dockerfile for Google Cloud Run deployment
FROM node:22-slim AS builder

WORKDIR /app

# Copy dependency manifests
COPY package*.json ./
COPY artifacts/api-server/package*.json ./artifacts/api-server/
COPY artifacts/gold-swing-ai/package*.json ./artifacts/gold-swing-ai/
COPY lib/api-client-react/package*.json ./lib/api-client-react/
COPY lib/api-spec/package*.json ./lib/api-spec/
COPY lib/api-zod/package*.json ./lib/api-zod/
COPY lib/db/package*.json ./lib/db/

# Install all dependencies needed for the build
RUN npm install --include=dev

# Copy remaining source code
COPY . .

# Build both frontend Vite assets and backend bundle
ENV NODE_ENV=production
RUN npm run build

# Runtime container
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Copy root files, dependencies, and built bundles
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/artifacts/api-server ./artifacts/api-server
COPY --from=builder /app/artifacts/gold-swing-ai/dist ./artifacts/gold-swing-ai/dist
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/firebase-applet-config.json ./firebase-applet-config.json

# Cloud Run binds to PORT 8080 by default
EXPOSE 8080

# Launch production server
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]
