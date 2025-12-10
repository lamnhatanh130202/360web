# frontend/Dockerfile - Multi-stage build
# Stage 1: Build Frontend
FROM node:20-alpine AS frontend-builder

WORKDIR /app/frontend

# Copy package files first for better caching
COPY frontend/package.json frontend/pnpm-lock.yaml* frontend/package-lock.json* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && corepack prepare pnpm@latest --activate && \
      pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy rest of frontend files
COPY frontend/ ./

# Build frontend
RUN if [ -f pnpm-lock.yaml ]; then pnpm build; else npm run build; fi

# Stage 2: Build CMS Frontend
FROM node:20-alpine AS cms-builder

WORKDIR /app/cms-frontend

# Copy package files first for better caching
COPY cms-frontend/package.json cms-frontend/pnpm-lock.yaml* cms-frontend/package-lock.json* ./

# Install dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      corepack enable && corepack prepare pnpm@latest --activate && \
      pnpm install --frozen-lockfile; \
    elif [ -f package-lock.json ]; then \
      npm ci; \
    else \
      npm install; \
    fi

# Copy rest of CMS files
COPY cms-frontend/ ./

# Build CMS
RUN if [ -f pnpm-lock.yaml ]; then pnpm build; else npm run build; fi

# Stage 3: Nginx server
FROM nginx:stable-alpine

# Copy nginx config
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

# Copy built frontend from stage 1
COPY --from=frontend-builder /app/frontend/dist/ ./

# Copy built CMS from stage 2
COPY --from=cms-builder /app/cms-frontend/dist/ ./cms/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
