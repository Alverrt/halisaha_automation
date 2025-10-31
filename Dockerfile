# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install build dependencies for canvas
RUN apk add --no-cache \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY src ./src

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install runtime dependencies for canvas, utilities, fonts for Turkish support, and ca-certificates for Google Cloud
RUN apk add --no-cache \
    cairo \
    jpeg \
    pango \
    giflib \
    pixman \
    wget \
    font-noto \
    font-noto-extra \
    fontconfig \
    ttf-dejavu \
    ca-certificates \
    && fc-cache -f

# Copy package files
COPY package*.json ./

# Install build dependencies temporarily for canvas
RUN apk add --no-cache --virtual .build-deps \
    build-base \
    g++ \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    giflib-dev \
    pixman-dev \
    && npm ci --only=production \
    && apk del .build-deps

# Copy built files from builder stage
COPY --from=builder /app/dist ./dist

# Copy SQL files (not compiled by TypeScript)
COPY --from=builder /app/src/database/*.sql ./dist/database/

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Create directory for Google Cloud credentials
RUN mkdir -p /app/.gcloud && \
    chown -R nodejs:nodejs /app/.gcloud

# Change ownership
RUN chown -R nodejs:nodejs /app

USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3000/health || exit 1

# Create entrypoint script for Google Cloud credentials handling
USER root
RUN echo '#!/bin/sh' > /entrypoint.sh && \
    echo 'set -e' >> /entrypoint.sh && \
    echo '' >> /entrypoint.sh && \
    echo '# Handle Google Cloud credentials from environment variables' >> /entrypoint.sh && \
    echo 'if [ -n "$GOOGLE_SERVICE_ACCOUNT_KEY_BASE64" ]; then' >> /entrypoint.sh && \
    echo '  echo "Creating service account key from base64 env var..."' >> /entrypoint.sh && \
    echo '  echo "$GOOGLE_SERVICE_ACCOUNT_KEY_BASE64" | base64 -d > /app/.gcloud/service-account-key.json' >> /entrypoint.sh && \
    echo '  chmod 600 /app/.gcloud/service-account-key.json' >> /entrypoint.sh && \
    echo '  export GOOGLE_APPLICATION_CREDENTIALS=/app/.gcloud/service-account-key.json' >> /entrypoint.sh && \
    echo 'elif [ -n "$GOOGLE_SERVICE_ACCOUNT_KEY_JSON" ]; then' >> /entrypoint.sh && \
    echo '  echo "Creating service account key from JSON env var..."' >> /entrypoint.sh && \
    echo '  echo "$GOOGLE_SERVICE_ACCOUNT_KEY_JSON" > /app/.gcloud/service-account-key.json' >> /entrypoint.sh && \
    echo '  chmod 600 /app/.gcloud/service-account-key.json' >> /entrypoint.sh && \
    echo '  export GOOGLE_APPLICATION_CREDENTIALS=/app/.gcloud/service-account-key.json' >> /entrypoint.sh && \
    echo 'fi' >> /entrypoint.sh && \
    echo '' >> /entrypoint.sh && \
    echo 'exec "$@"' >> /entrypoint.sh && \
    chmod +x /entrypoint.sh && \
    chown nodejs:nodejs /entrypoint.sh

USER nodejs

# Set entrypoint
ENTRYPOINT ["/entrypoint.sh"]

# Start the application
CMD ["node", "dist/index.js"]
