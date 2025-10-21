# frontend/Dockerfile
FROM node:18-alpine AS build
WORKDIR /app

# copy only manifest files first to install deps (cache layer)
COPY package.json package-lock.json* yarn.lock* ./

# use npm ci (or npm install if no lockfile)
RUN npm ci --silent

# copy source (now node_modules is NOT in context thanks to .dockerignore)
COPY . .

RUN npm run build

# frontend/Dockerfile (production: copy built dist into nginx)
FROM nginx:stable-alpine
COPY ./dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

