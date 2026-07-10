# Build from the repo root: docker build -f packages/ingest/Dockerfile .
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
COPY packages/ingest packages/ingest
RUN npm run build -w @snag/shared -w @snag/detectors -w @snag/ingest

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/shared packages/shared
COPY --from=build /app/packages/detectors packages/detectors
COPY --from=build /app/packages/ingest packages/ingest
EXPOSE 8787
CMD ["node", "packages/ingest/dist/server.js"]
