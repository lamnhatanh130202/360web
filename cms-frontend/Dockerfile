# cms-frontend/Dockerfile
FROM nginx:stable-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
WORKDIR /usr/share/nginx/html
COPY ./dist/ ./
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
