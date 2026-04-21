# Alpine-only build so the Claude Agent SDK's musl-libc native binary
# installs during `npm ci` (Railway's default Railpack builder is glibc,
# which silently skips linux-x64-musl packages).
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# --legacy-peer-deps: Agent SDK declares zod@^4, project is on zod@3.
# --force + explicit libc/os env: npm on Alpine can report libc=null which
# causes it to skip the musl-specific binary package. Forcing the env
# makes sure it installs even if auto-detection fails.
ENV npm_config_libc=musl
ENV npm_config_os=linux
ENV npm_config_cpu=x64
RUN npm ci --include=optional --legacy-peer-deps --force \
  && test -f node_modules/@anthropic-ai/claude-agent-sdk-linux-x64-musl/claude \
  && echo "musl binary OK"

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
# Alpine needs libstdc++ for the Claude native binary.
RUN apk add --no-cache libstdc++
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
EXPOSE 3000
CMD ["npx", "next", "start", "-p", "3000"]
