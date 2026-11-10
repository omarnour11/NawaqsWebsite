FROM node:20-alpine

WORKDIR /app

# Copy all website assets and server code
COPY . .

# Environment defaults
ENV PORT=8080
ENV ADMIN_SECRET_KEY=nawaqss_prod_2026

EXPOSE 8080

# Run with zero external dependencies
CMD ["node", "server.js"]

