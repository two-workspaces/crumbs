#!/bin/sh
# Maps Railway onto Crumbs: $PORT, ORIGIN from the public domain, the client address from
# Railway's edge, and an admin account made before the port opens (railway/setup.cjs).
# It runs as the node user: upstream's crumbs-entrypoint.sh hands the /data volume to node
# and drops root before calling this. Nothing here exits on a bad variable: it logs and
# falls back, so a typo never leaves the service crash-looping.
set -u
cd /app

log() { echo "railway: $*"; }
lower() { printf '%s' "${1:-}" | tr '[:upper:]' '[:lower:]'; }
truthy() { case "$(lower "${1:-}")" in 1|true|yes|on) return 0 ;; esac; return 1; }

case "${PORT:-}" in
  ''|*[!0-9]*) log "PORT='${PORT:-}' is not a number, using 3000"; PORT=3000 ;;
esac
export PORT
# '::' takes IPv4 (the public domain, the healthcheck) and IPv6 (Railway's private network).
export HOST="${HOST:-::}"

# SvelteKit checks uploads' Origin header against ORIGIN, so it must be the address users
# type. The image's default is http://localhost:3000; a custom domain needs ORIGIN set by hand.
origin=${ORIGIN:-}
[ "$origin" = "http://localhost:3000" ] && origin=
if [ -z "$origin" ] && [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
  origin="https://$RAILWAY_PUBLIC_DOMAIN"
fi
origin=${origin%/}
case "$origin" in
  http://?*|https://?*) ;;
  '') log "no public domain: add one in Settings > Networking, then redeploy. Until then image uploads are refused."
      origin="http://localhost:$PORT" ;;
  *)  log "ORIGIN='$origin' must start with https://, ignoring it"
      if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then origin="https://$RAILWAY_PUBLIC_DOMAIN"; else origin="http://localhost:$PORT"; fi ;;
esac
export ORIGIN="$origin"

# Attachments are up to 10 MB plus a thumbnail. adapter-node refuses to start on a value it
# can't parse, so check it here.
if ! printf '%s' "${BODY_SIZE_LIMIT:-}" | grep -Eiq '^([0-9]+[kmg]?|infinity)$'; then
  [ -n "${BODY_SIZE_LIMIT:-}" ] && log "BODY_SIZE_LIMIT='$BODY_SIZE_LIMIT' is not like 12M, using 12M"
  BODY_SIZE_LIMIT=12M
fi
export BODY_SIZE_LIMIT

# Login lockout (5 failures locks the address out for 15 minutes) is per client address.
# Without this every visitor looks like Railway's edge, and one stranger's guesses would lock
# everyone out. Railway's edge sets X-Real-IP to the real client and overwrites any sent value.
case "$(lower "${ADDRESS_HEADER:-x-real-ip}")" in
  none|off|'') unset ADDRESS_HEADER XFF_DEPTH ;;
  *) export ADDRESS_HEADER="${ADDRESS_HEADER:-X-Real-IP}" ;;
esac
case "${XFF_DEPTH:-1}" in
  *[!0-9]*|0) log "XFF_DEPTH='$XFF_DEPTH' is not a positive number, using 1"; export XFF_DEPTH=1 ;;
esac

# Upstream refuses to start when proxy auth is on with a required setting missing.
if truthy "${AUTH_PROXY_ENABLED:-}" && { [ -z "${AUTH_PROXY_TRUSTED_IPS:-}" ] || [ -z "${AUTH_PROXY_LOGOUT_URL:-}" ]; }; then
  log "AUTH_PROXY_ENABLED needs AUTH_PROXY_TRUSTED_IPS and AUTH_PROXY_LOGOUT_URL; leaving proxy auth off"
  unset AUTH_PROXY_ENABLED
fi

if ! node /app/railway/setup.cjs; then
  exec node /app/railway/notice.cjs "Crumbs could not create its admin account, so it stays closed instead of showing a setup page anyone could claim."
fi

log "starting Crumbs on port $PORT for $ORIGIN"
started=$(date +%s)
stopping=
node build &
pid=$!
trap 'stopping=1; kill -TERM "$pid" 2>/dev/null' TERM INT
status=0
# wait returns early when a trapped signal arrives, so wait until node has really gone.
while :; do
  wait "$pid"; status=$?
  kill -0 "$pid" 2>/dev/null || break
done

# Exiting within a minute of start is a configuration problem (an AUTH_PROXY_* value, say),
# and restarting would only loop. Serve a notice page instead; later crashes restart normally.
if [ -z "$stopping" ] && [ "$status" -ne 0 ] && [ $(( $(date +%s) - started )) -lt 60 ]; then
  exec node /app/railway/notice.cjs "Crumbs stopped right after starting (exit code $status), most likely over a variable."
fi
exit "$status"
