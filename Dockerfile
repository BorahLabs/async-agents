FROM node:22-slim

# System dependencies
RUN apt-get update && apt-get install -y \
    curl git \
    && rm -rf /var/lib/apt/lists/*

# Install OpenCode CLI
RUN curl -fsSL https://opencode.ai/install | bash
ENV PATH="/root/.opencode/bin:/root/.local/bin:${PATH}"

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
    | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
    | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    && apt-get update && apt-get install -y gh \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install ALL backend dependencies (need devDeps for tsc)
COPY package.json package-lock.json* ./
RUN npm ci

# Build backend
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# Remove devDependencies after build
RUN npm prune --omit=dev

# Install and build admin panel
COPY admin/package.json admin/package-lock.json* ./admin/
RUN cd admin && npm ci
COPY admin/ ./admin/
RUN cd admin && npm run build

# Copy built admin panel to dist for static serving
RUN cp -r admin/dist ./dist/admin

# Clean up admin source (only need the built files)
RUN rm -rf admin/src admin/node_modules

# Copy research docs (referenced by CLAUDE.md)
COPY research/ ./research/

EXPOSE 3000

# Persistent volumes
VOLUME ["/app/data", "/app/db"]

CMD ["node", "dist/server.js"]
