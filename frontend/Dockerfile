FROM nginx:1.27-alpine

WORKDIR /usr/share/nginx/html

COPY docker/nginx/default.conf /etc/nginx/conf.d/default.conf
COPY app ./app
COPY dist ./dist
COPY plugins ./plugins
COPY build ./build

EXPOSE 80
