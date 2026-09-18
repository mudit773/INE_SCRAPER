FROM mcr.microsoft.com/playwright:v1.63.0-noble AS build
WORKDIR /app
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY tsconfig.base.json eslint.config.js ./
COPY apps/api apps/api
RUN npm run build -w @tracker/api

FROM mcr.microsoft.com/playwright:v1.63.0-noble
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --omit=dev --workspace @tracker/api --include-workspace-root=false
COPY --from=build /app/apps/api/dist apps/api/dist
USER pwuser
CMD ["node", "apps/api/dist/server.js"]
