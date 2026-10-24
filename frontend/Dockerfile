# 多阶段构建：Node 构建静态产物 → Nginx 托管
# 注意：构建上下文为仓库根目录（见 docker-compose.yml），以便复用 deploy/nginx 配置。

FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ARG VITE_TMAP_KEY=""
ENV VITE_TMAP_KEY=$VITE_TMAP_KEY
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
