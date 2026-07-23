ARG FINAL_STAGE=runtime

FROM oven/bun:1.3.7 AS dependencies
WORKDIR /app
COPY package.json bun.lock ./
RUN --mount=type=cache,target=/root/.bun/install/cache bun install --frozen-lockfile

FROM dependencies AS migrations
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY src/lib/database-config.ts ./src/lib/database-config.ts
ENV NODE_ENV=production
ENTRYPOINT ["bun", "run", "prisma:migrate:deploy"]

FROM dependencies AS build
COPY . .
ARG NEXT_PUBLIC_WORKOS_REDIRECT_URI
ENV NEXT_PUBLIC_WORKOS_REDIRECT_URI=$NEXT_PUBLIC_WORKOS_REDIRECT_URI
RUN bun run prisma:generate && bun run build

FROM oven/bun:1.3.7 AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build --chown=bun:bun /app/public ./public
RUN mkdir .next && chown bun:bun .next
COPY --from=build --chown=bun:bun /app/.next/standalone ./
COPY --from=build --chown=bun:bun /app/.next/static ./.next/static
USER bun
ENTRYPOINT ["bun", "server.js"]

FROM ${FINAL_STAGE} AS final
