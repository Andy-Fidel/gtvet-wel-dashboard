FROM node:22-bookworm-slim AS client-build

WORKDIR /app
COPY client/package.json client/package-lock.json ./client/
RUN npm ci --prefix client
COPY client ./client
RUN npm run build --prefix client

FROM node:22-bookworm-slim AS runtime

ARG APP_COMMIT=unknown
ARG APP_BUILD_TIME=unknown
ENV APP_COMMIT=$APP_COMMIT APP_BUILD_TIME=$APP_BUILD_TIME

WORKDIR /app
ENV NODE_ENV=production

COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server \
    && npm cache clean --force

COPY server ./server
COPY --from=client-build /app/client/dist ./client/dist

RUN mkdir -p /app/server/local-uploads \
    && chown -R node:node /app/server/local-uploads

USER node
EXPOSE 5001

CMD ["npm", "start", "--prefix", "server"]
