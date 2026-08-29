<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-Origin Resource Sharing (CORS) Configuration
    |--------------------------------------------------------------------------
    |
    | The SPA lives on a different origin than the API during development
    | (Vite on :3000, Laravel on :8000), so the browser needs an explicit
    | allow-list. Origins come from FRONTEND_URL / FRONTEND_URLS so that
    | staging and production can be added without editing this file. No
    | wildcard: the API is credentialed and a wildcard origin is both unsafe
    | and rejected by browsers when credentials are in play.
    |
    */

    'paths' => ['api/*'],

    'allowed_methods' => ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

    'allowed_origins' => array_values(array_filter(array_map(
        'trim',
        explode(',', (string) env('FRONTEND_URLS', env('FRONTEND_URL', 'http://localhost:3000')))
    ))),

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['Accept', 'Authorization', 'Content-Type', 'X-Requested-With'],

    'exposed_headers' => [],

    'max_age' => 3600,

    'supports_credentials' => true,

];
