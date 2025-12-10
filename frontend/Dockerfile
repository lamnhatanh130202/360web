# frontend/Dockerfile
FROM nginx:stable-alpine

# Copy nginx config from frontend directory
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf

WORKDIR /usr/share/nginx/html

# Copy built viewer app
COPY frontend/dist/ ./

# Copy built CMS app under /cms
COPY cms-frontend/dist/ ./cms/

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
