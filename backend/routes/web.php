<?php

use Illuminate\Support\Facades\Route;

// Route::view rather than a closure: `php artisan route:cache` refuses to
// serialize closures, and the production image caches routes on boot. Nothing
// proxies / to Laravel anyway — nginx only forwards /api/ — but leaving an
// uncacheable route here would fail the boot.
Route::view('/', 'welcome');
