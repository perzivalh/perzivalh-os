FROM node:20-slim

# Dependencias para compilar sqlite3 (módulo nativo)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar schemas de Prisma (referenciados desde apps/api como ../../prisma/)
COPY prisma/ ./prisma/

# Instalar dependencias de la API
COPY apps/api/package.json ./apps/api/
RUN cd apps/api && npm install

# Copiar código fuente de la API
COPY apps/api/ ./apps/api/

# Generar clientes Prisma
RUN cd apps/api && npx prisma generate --schema ../../prisma/tenant/schema.prisma
RUN cd apps/api && npx prisma generate --schema ../../prisma/control/schema.prisma

WORKDIR /app/apps/api

ENV PORT=8080
ENV NODE_ENV=production

EXPOSE 8080

CMD ["node", "server.js"]
