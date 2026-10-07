FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public
COPY scripts ./scripts

# Os dados ficam em /app/data (ou no volume do Railway, via RAILWAY_VOLUME_MOUNT_PATH).
# Sem a instrução VOLUME de propósito: o Railway recusa o build quando ela existe.
# Roda como root porque os volumes do Railway são montados como root.
RUN mkdir -p /app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
