FROM node:24.22.1-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json ./

RUN npm ci --omit=dev --no-audit --no-fund

FROM node:24.22.1-alpine AS runner

ENV NODE_ENV=production
ENV PORT=3000

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# The app can write only to uploads, so a flaw in a route cannot change the code it runs
RUN mkdir -p uploads && chown node:node uploads

EXPOSE 3000

USER node

CMD ["node", "app.js"]
