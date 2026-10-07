# Build stage — Node runs the build (more stable memory use than Bun for Vite)
FROM node:22-slim AS build
WORKDIR /app
RUN npm install -g bun@1

COPY package.json bun.lock bunfig.toml ./
RUN bun install --frozen-lockfile

COPY . .
# Build the server for a Node runtime (Coolify/Docker), not the edge default
ENV NITRO_PRESET=node-server
ENV DOCKER_BUILD=1
ENV NODE_OPTIONS=--max-old-space-size=3072
RUN node node_modules/vite/bin/vite.js build

# Run stage
FROM node:22-slim AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY --from=build /app/.output ./.output

EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
