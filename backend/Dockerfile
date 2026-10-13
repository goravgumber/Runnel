# Stage 1: Build & Install dependencies
FROM node:24-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json ./

# Install all dependencies including devDependencies (to build/minify if needed)
RUN npm ci

# Copy application source
COPY . .

# Prune dev dependencies for the final production build
RUN npm prune --production

# Stage 2: Production release
FROM node:24-alpine AS runner

WORKDIR /usr/src/app

# Set production environment
ENV NODE_ENV=production
ENV PORT=5000

# Run container as a non-privileged user for security hardening
RUN chown -R node:node /usr/src/app
USER node

# Copy dependencies and source from builder stage
COPY --chown=node:node --from=builder /usr/src/app/node_modules ./node_modules
COPY --chown=node:node --from=builder /usr/src/app/package.json ./package.json
COPY --chown=node:node --from=builder /usr/src/app/server.js ./server.js
COPY --chown=node:node --from=builder /usr/src/app/config ./config
COPY --chown=node:node --from=builder /usr/src/app/controllers ./controllers
COPY --chown=node:node --from=builder /usr/src/app/docs ./docs
COPY --chown=node:node --from=builder /usr/src/app/middleware ./middleware
COPY --chown=node:node --from=builder /usr/src/app/models ./models
COPY --chown=node:node --from=builder /usr/src/app/routes ./routes
COPY --chown=node:node --from=builder /usr/src/app/services ./services
COPY --chown=node:node --from=builder /usr/src/app/sockets ./sockets
COPY --chown=node:node --from=builder /usr/src/app/utils ./utils
COPY --chown=node:node --from=builder /usr/src/app/validators ./validators
COPY --chown=node:node --from=builder /usr/src/app/queues ./queues
COPY --chown=node:node --from=builder /usr/src/app/workers ./workers
COPY --chown=node:node --from=builder /usr/src/app/repositories ./repositories

EXPOSE 5000

CMD ["node", "server.js"]
