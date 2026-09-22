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

# Clear before anything reads config, not after. A cache file left in the image
# layer from a previous build would otherwise win over the environment this
# container was actually started with -- and `migrate` resolves DB_DATABASE
# through that same config, so a stale entry would migrate the wrong file.
php artisan config:clear

php artisan migrate --force

# Registration only ever produces a free `user`, and an admin is the only role
# that can upgrade a plan, so without this a fresh deployment comes up with
# nobody able to administer it. Idempotent, and a no-op unless both ADMIN_EMAIL
# and ADMIN_PASSWORD are set.
php artisan admin:bootstrap

php artisan config:cache
php artisan route:cache
php artisan view:cache

exec "$@"
