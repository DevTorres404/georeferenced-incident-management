FROM php:8.4-fpm-bookworm AS base

ARG WWWUSER=1000
ARG WWWGROUP=1000

WORKDIR /var/www/html

ENV COMPOSER_ALLOW_SUPERUSER=1
ENV PHP_OPCACHE_VALIDATE_TIMESTAMPS=0

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    libfreetype6-dev \
    libicu-dev \
    libjpeg62-turbo-dev \
    libonig-dev \
    libpng-dev \
    libpq-dev \
    libwebp-dev \
    libzip-dev \
    unzip \
    zip \
    && docker-php-ext-configure gd --with-freetype --with-jpeg --with-webp \
    && docker-php-ext-install -j"$(nproc)" \
    bcmath \
    exif \
    gd \
    intl \
    mbstring \
    opcache \
    pcntl \
    pdo_pgsql \
    pgsql \
    sockets \
    zip \
    && pecl install redis \
    && docker-php-ext-enable redis \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/pear

RUN groupmod -o -g "${WWWGROUP}" www-data \
    && usermod -o -u "${WWWUSER}" -g www-data www-data

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

COPY docker/production/php/php.ini /usr/local/etc/php/conf.d/99-sgi.ini
COPY docker/production/php/opcache.ini /usr/local/etc/php/conf.d/99-opcache.ini

COPY composer.json composer.lock ./

RUN composer install \
    --no-dev \
    --no-interaction \
    --no-progress \
    --prefer-dist \
    --optimize-autoloader \
    --no-scripts

COPY . .

RUN composer dump-autoload --optimize \
    && php artisan package:discover --ansi \
    && mkdir -p storage/app/public storage/framework/cache/data storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R ug+rwX storage bootstrap/cache

USER www-data

EXPOSE 9000

CMD ["php-fpm"]