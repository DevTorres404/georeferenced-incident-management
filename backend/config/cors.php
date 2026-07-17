<?php

$normalizeOrigin = static function (string $origin): ?string {
    $origin = trim($origin);

    if ($origin === '' || str_contains($origin, '*') || filter_var($origin, FILTER_VALIDATE_URL) === false) {
        return null;
    }

    $parts = parse_url($origin);

    if ($parts === false) {
        return null;
    }

    $scheme = strtolower($parts['scheme'] ?? '');

    if (! in_array($scheme, ['http', 'https'], true)
        || ! isset($parts['host'])
        || isset($parts['user'])
        || isset($parts['pass'])
        || isset($parts['query'])
        || isset($parts['fragment'])
        || (isset($parts['path']) && $parts['path'] !== '' && $parts['path'] !== '/')) {
        return null;
    }

    $host = strtolower($parts['host']);
    $port = $parts['port'] ?? null;
    $isDefaultPort = ($scheme === 'http' && $port === 80) || ($scheme === 'https' && $port === 443);

    return $scheme.'://'.$host.($port !== null && ! $isDefaultPort ? ':'.$port : '');
};

$allowedOrigins = array_values(array_unique(array_filter(array_map(
    $normalizeOrigin,
    explode(',', (string) env('CORS_ALLOWED_ORIGINS', env('FRONTEND_URL', 'http://localhost:5500')))
))));

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | Here you may configure your settings for cross-origin resource sharing
    | or "CORS". This determines what cross-origin operations may execute
    | in web browsers. You are free to adjust these settings as needed.
    |
    | To learn more: https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
    |
    */

    'paths' => ['api/*', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $allowedOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
