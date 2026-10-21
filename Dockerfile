FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000

# Retorno de Análise de Crédito (PDF): gerador em Python com ReportLab; DejaVu tem os símbolos ✓ e ✗ do status.
# Implantação: pdftotext (poppler-utils) lê o PDF das análises feitas antes do portal
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 python3-reportlab fonts-dejavu-core poppler-utils \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY public ./public
COPY scripts ./scripts

# Os dados ficam em /app/data (ou no volume do Railway, via RAILWAY_VOLUME_MOUNT_PATH).
# Sem a instrução VOLUME de propósito: o Railway recusa o build quando ela existe.
# Roda como root porque os volumes do Railway são montados como root; na VPS (deploy/vps) roda como "node",
# por isso a pasta já nasce dele (o volume novo herda o dono).
RUN mkdir -p /app/data && chown node:node /app/data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:'+(process.env.PORT||3000)+'/saude').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/index.js"]
