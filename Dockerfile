FROM node:22-slim

# Install OpenCode CLI
RUN apt-get update && apt-get install -y curl git && \
    curl -fsSL https://opencode.ai/install | bash && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Ensure opencode is in PATH
ENV PATH="/root/.local/bin:${PATH}"

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install

# Copy source
COPY tsconfig.json ./
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Copy config and research docs
COPY opencode.json* ./
COPY research/ ./research/

EXPOSE 3000

CMD ["node", "dist/server.js"]
