FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force
COPY server.js ./
ENV NODE_ENV=production
EXPOSE 3000
# Runs as the image's built-in unprivileged user instead of root -- server.js never needs root
# (it only reads its own files and binds a port >1024). If ./data on the host was created by
# Docker before this existed, `chown -R 1000:1000 ./data` once fixes a permission error here
# (see docs/SELF_HOSTING.md).
USER node
CMD ["node", "server.js"]
