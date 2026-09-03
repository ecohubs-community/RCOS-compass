# RCOS Compass. docs/00-architecture.md §7: adapter-node on a VPS with a mounted
# volume, single instance. Not serverless — SQLite and the in-process job worker
# both assume one process with a real filesystem.

FROM node:24-bookworm-slim AS build
ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# better-sqlite3 compiles a native binding. The toolchain stays in this stage;
# the runtime image below gets only the compiled result.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# The data volume holds the SQLite database and uploaded documents. Backing up
# one without the other is a broken restore — docs/00-architecture.md §9.
RUN mkdir -p /data/uploads && chown -R node:node /data
VOLUME /data

COPY --from=build --chown=node:node /app/build ./build
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/drizzle ./drizzle
# RCOS itself. The loader reads it from disk at runtime, so the image is
# incomplete without it — every page that renders a clause would 500.
COPY --from=build --chown=node:node /app/standard ./standard
COPY --from=build --chown=node:node /app/package.json ./package.json

ENV DATABASE_URL=file:/data/compass.db
ENV UPLOAD_DIR=/data/uploads
ENV PORT=3000
# ORIGIN and PUBLIC_APP_URL are deliberately not defaulted: they are the
# deployment's public address, the boot check refuses to start without ORIGIN in
# production, and a wrong guess here would be a silent 403 on every form.

EXPOSE 3000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
	CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "build/index.js"]
