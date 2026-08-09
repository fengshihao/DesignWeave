FROM node:22-bookworm-slim AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.6.9 --activate
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/schema/package.json packages/schema/
COPY packages/prompts/package.json packages/prompts/
COPY apps/agent/package.json apps/agent/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @designweave/schema build \
 && pnpm --filter @designweave/prompts build \
 && pnpm --filter @designweave/agent build \
 && pnpm --filter @designweave/web build

FROM node:22-bookworm-slim AS agent
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.6.9 --activate
ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV AGENT_PORT=8787
COPY --from=build /app /app
EXPOSE 8787
CMD ["pnpm", "--filter", "@designweave/agent", "start"]

FROM node:22-bookworm-slim AS web
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.6.9 --activate
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 3100
CMD ["pnpm", "--filter", "@designweave/web", "start"]
