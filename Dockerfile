# syntax=docker/dockerfile:1.7

FROM node:20-alpine3.19 AS deps
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json* ./
RUN npm ci

FROM deps AS build
WORKDIR /app
ARG VITE_CHATKIT_DOMAIN_KEY
ENV VITE_CHATKIT_DOMAIN_KEY=$VITE_CHATKIT_DOMAIN_KEY
COPY . .
RUN npm run build

FROM node:20-alpine3.19 AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/prompts ./prompts
COPY --from=build /app/public ./public

EXPOSE 3000

CMD ["node", "server/index.js"]

