FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# A transitive dep (fdir) requires picomatch@^3||^4, but the tree pins
# picomatch@2.3.2 at the root. --legacy-peer-deps skips the peer check
# so `npm ci` doesn't abort on this harmless mismatch.
RUN npm ci --legacy-peer-deps

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
CMD ["npx", "next", "start"]
