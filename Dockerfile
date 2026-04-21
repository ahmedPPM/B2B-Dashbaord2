# Debian-slim to match Railway's runtime (glibc) — previous Alpine attempt
# built with musl libc, but Railway ran it on a glibc base so the native
# binary failed to load. Sticking with glibc throughout avoids the skew.
FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: Agent SDK declares zod@^4, project is on zod@3.
# The force flag + libc/os env ensures the glibc native binary installs
# even if npm's platform detection is flaky on the builder.
ENV npm_config_libc=glibc
ENV npm_config_os=linux
ENV npm_config_cpu=x64
RUN npm ci --include=optional --legacy-peer-deps --force \
  && test -f node_modules/@anthropic-ai/claude-agent-sdk-linux-x64/claude \
  && echo "glibc binary OK"

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
