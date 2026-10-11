#!/usr/bin/env bash
# Make the port in PUBLIC_URL actually answer, so shared registration links work.
#
# Registration links are shared without a port (http://HOST/register/SLUG) so chat
# apps linkify them. That means port 80 has to be served. The app binds it itself,
# but only if nothing else holds the port and systemd grants CAP_NET_BIND_SERVICE.
#
# Usage (on the EC2 host):  bash deploy/serve-public-port.sh [PUBLIC_URL]
set -euo pipefail

PUBLIC_URL="${1:-${PUBLIC_URL:-http://127.0.0.1}}"
HOSTPART="${PUBLIC_URL#*://}"
HOSTPART="${HOSTPART%%/*}"
case "$HOSTPART" in
  *:*) PUBLIC_PORT="${HOSTPART##*:}" ;;
  *)   PUBLIC_PORT=80 ;;
esac
HOSTNAME_ONLY="${HOSTPART%%:*}"
APP_PORT="${PORT:-3000}"

echo "PUBLIC_URL=$PUBLIC_URL (port $PUBLIC_PORT), app port $APP_PORT"

if [ "$PUBLIC_PORT" != "$APP_PORT" ]; then
  # A stale or wedged reverse proxy on the public port silently breaks every
  # shared link: it still accepts connections but never answers.
  for svc in nginx httpd apache2 caddy; do
    active="$(systemctl is-active "$svc" 2>/dev/null || true)"
    enabled="$(systemctl is-enabled "$svc" 2>/dev/null || true)"
    if [ "$active" = "active" ] || [ "$enabled" = "enabled" ]; then
      echo "Freeing port $PUBLIC_PORT: stopping and disabling $svc"
      sudo systemctl disable --now "$svc" || true
    fi
  done

  if command -v firewall-cmd >/dev/null 2>&1; then
    sudo firewall-cmd --permanent --add-port="$PUBLIC_PORT/tcp" || true
    sudo firewall-cmd --reload || true
  fi
fi

sudo systemctl restart arcusverse
sleep 4
sudo systemctl --no-pager --full status arcusverse || true

fail=0
check() {
  local url="$1"
  local code
  code="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$url" || echo 000)"
  echo "  $url -> $code"
  [ "$code" = "200" ] || fail=1
}

echo "Verifying:"
check "http://127.0.0.1:$APP_PORT/"
if [ "$PUBLIC_PORT" != "$APP_PORT" ]; then
  check "http://127.0.0.1:$PUBLIC_PORT/"
fi
check "http://$HOSTNAME_ONLY:$PUBLIC_PORT/"

if [ "$fail" != "0" ]; then
  echo "Port $PUBLIC_PORT is still not answering. Check:"
  echo "  sudo ss -ltnp '( sport = :$PUBLIC_PORT )'"
  echo "  sudo journalctl -u arcusverse -n 50"
  echo "  AWS security group must allow inbound TCP $PUBLIC_PORT"
  exit 1
fi

echo "OK — share links as $PUBLIC_URL/register/<slug>"
