#!/bin/sh
# Boot the Laravel container: make sure the database exists, migrate it, then
# warm the caches.
#
# The caches are built here rather than in the image because config:cache bakes
# the current environment in. Baking it at build time would freeze whatever
# APP_KEY and GEMINI_API_KEY happened to exist in the build context -- which is
# nothing, since .dockerignore keeps .env out.
set -e

DB_PATH="${DB_DATABASE:-/data/database.sqlite}"

# The SQLite file lives on a volume, so on a fresh deploy the directory exists
# but the file does not, and Laravel will not create it.
mkdir -p "$(dirname "$DB_PATH")"
if [ ! -f "$DB_PATH" ]; then
    echo "Creating $DB_PATH"
    touch "$DB_PATH"
fi

php artisan migrate --force

# Clear first: a cache file left in the image layer from a previous build would
# otherwise win over the environment this container was actually started with.
php artisan config:clear
php artisan config:cache
php artisan route:cache
php artisan view:cache

exec "$@"
