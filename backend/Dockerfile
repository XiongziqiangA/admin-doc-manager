FROM node:24-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY backend/prisma backend/prisma
RUN pnpm install --filter backend --frozen-lockfile
WORKDIR /app/backend
RUN pnpm prisma:generate
WORKDIR /app
COPY backend ./backend
WORKDIR /app/backend
RUN pnpm build

FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY backend/package.json backend/package.json
COPY backend/prisma backend/prisma
RUN pnpm install --filter backend --prod --frozen-lockfile
WORKDIR /app/backend
RUN pnpm prisma:generate
COPY --from=build /app/backend/dist ./dist
WORKDIR /app/backend
CMD ["node", "dist/main.js"]
