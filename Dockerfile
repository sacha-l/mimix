FROM mcr.microsoft.com/playwright:v1.60.0-noble AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
# Install pnpm directly via npm — the corepack bundled in this image has
# stale npm-registry signing keys and fails to verify pnpm downloads.
RUN npm install -g pnpm@10.8.1

FROM base AS deps
WORKDIR /app
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/web/package.json apps/web/
COPY demo-target/package.json demo-target/
COPY packages/persona-types/package.json packages/persona-types/
COPY packages/policy-engine/package.json packages/policy-engine/
COPY packages/personas/package.json packages/personas/
COPY services/orchestrator/package.json services/orchestrator/
COPY services/agent-runtime/package.json services/agent-runtime/
COPY services/mcp-server/package.json services/mcp-server/
RUN pnpm install --frozen-lockfile

FROM deps AS build
WORKDIR /app
COPY . .
# NEXT_PUBLIC_* must be set at build time so they're baked into the client bundle.
# These are non-secret values for the public devnet demo.
ENV NEXT_PUBLIC_TREASURY_PUBKEY=373pSVQQq4jfyYJ7hUmMrbkzHKSxcdJ8wg7dzSYQPJtC
ENV NEXT_PUBLIC_USDG_MINT=7NfA9TQgb5RLEAiPHxgR9tQ97gtJ47Vfkc1CYVkMxZW2
ENV NEXT_PUBLIC_DEBUG_MODE=true
ENV NEXT_PUBLIC_DEFAULT_TARGET_URL=https://demo-target.vercel.app/?test=1
RUN pnpm --filter @mimix/web build
RUN pnpm --filter @mimix/demo-target build

FROM base AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV MIMIX_ROOT=/app
ENV HOSTNAME=0.0.0.0
ENV NEXT_PUBLIC_DEFAULT_TARGET_URL=https://demo-target.vercel.app/?test=1
COPY --from=build /app /app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh \
 && mkdir -p /app/runs /app/users \
 && chown -R pwuser:pwuser /app
USER pwuser
EXPOSE 3000
CMD ["/usr/local/bin/docker-entrypoint.sh"]
