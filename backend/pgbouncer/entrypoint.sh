#!/bin/sh
# entrypoint.sh — Generates userlist.txt from environment variables at startup.
# Never commit real passwords into userlist.txt directly.
set -eu

USERLIST="/etc/pgbouncer/userlist.txt"

: "${PGBOUNCER_POSTGRES_PASSWORD:?PGBOUNCER_POSTGRES_PASSWORD env var is required}"
: "${PGBOUNCER_SEARCH_PASSWORD:?PGBOUNCER_SEARCH_PASSWORD env var is required}"
: "${PGBOUNCER_BOOKING_PASSWORD:?PGBOUNCER_BOOKING_PASSWORD env var is required}"

cat > "$USERLIST" <<EOF
"postgres" "${PGBOUNCER_POSTGRES_PASSWORD}"
"shopno_search_readonly" "${PGBOUNCER_SEARCH_PASSWORD}"
"shopno_booking_tx" "${PGBOUNCER_BOOKING_PASSWORD}"
EOF

chmod 600 "$USERLIST"
echo "[entrypoint] userlist.txt generated."

exec pgbouncer /etc/pgbouncer/pgbouncer.ini
