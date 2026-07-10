# Build from the repo root: docker build -f packages/dashboard/Dockerfile .
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/detectors/package.json packages/detectors/
COPY packages/sdk/package.json packages/sdk/
COPY packages/ingest/package.json packages/ingest/
COPY packages/dashboard/package.json packages/dashboard/
RUN npm install --workspaces --include-workspace-root --ignore-scripts
COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY packages/detectors packages/detectors
COPY packages/dashboard packages/dashboard
RUN npm run build -w @snag/shared -w @snag/detectors \
  && npm run build -w @snag/dashboard

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/packages/dashboard/.next/standalone ./
COPY --from=build /app/packages/dashboard/.next/static packages/dashboard/.next/static
EXPOSE 3000
ENV PORT=3000 HOSTNAME=0.0.0.0
CMD ["node", "packages/dashboard/server.js"]
