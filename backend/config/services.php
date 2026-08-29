<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | Google Generative Language (Gemini)
    |--------------------------------------------------------------------------
    |
    | There is no official Gemini PHP SDK, so App\Services\GeminiService talks
    | to the REST API directly. `model` is used by every text/JSON/chat call;
    | `tts_model` only by textToSpeech(). The retry knobs cover transient 5xx
    | and 429 responses — 4xx is never retried.
    |
    */

    'gemini' => [
        'key' => env('GEMINI_API_KEY'),
        'model' => env('GEMINI_MODEL', 'gemini-2.0-flash'),
        'tts_model' => env('GEMINI_TTS_MODEL', 'gemini-2.5-flash-preview-tts'),
        'base_url' => env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com/v1beta'),
        'timeout' => (int) env('GEMINI_TIMEOUT', 60),
        'connect_timeout' => (int) env('GEMINI_CONNECT_TIMEOUT', 10),
        'retries' => (int) env('GEMINI_RETRIES', 3),
        'retry_delay' => (int) env('GEMINI_RETRY_DELAY', 500),
    ],

];
