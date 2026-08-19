#!/usr/bin/env bash
# dsh LAN TLS certificate manager.
#
# Maintains caddy/certs/dsh.{crt,key} — a leaf certificate for the current
# LAN IP, signed by a stable local CA (caddy/certs/ca/ca.{crt,key}, created
# once, 10y). Devices that install caddy/certs/ca/ca.crt into their trust
# store keep trusting this server across IP changes and renewals — no
# per-device re-setup.
#
# The caddy Caddyfile loads caddy/certs/dsh.crt (leaf + CA chain
# concatenated) and caddy/certs/dsh.key, so no proxy config changes when the
# IP moves.
#
# Exit codes: 0  = cert already valid for the current IP (no change)
#             10 = (re)generated the server cert (caller should restart caddy)
#             1  = error
set -euo pipefail

SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
DEPLOY_DIR="$(dirname "$SCRIPT")"
CERT_DIR="${DSH_CERT_DIR:-$DEPLOY_DIR/caddy/certs}"
CA_DIR="$CERT_DIR/ca"
WORK_DIR="$CERT_DIR/.work"

# IP resolution mirrors the launcher: DSH_LAN_IP wins, else the primary
# outbound address, else the first RFC1918 `hostname -I` address.
detect_ip() {
    local ip
    ip=$(ip -4 route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src"){print $(i+1); exit}}')
    if [ -z "$ip" ]; then
        ip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.)' | head -1 || true)
    fi
    [ -n "$ip" ] || ip=127.0.0.1
    echo "$ip"
}

LAN_IP="${DSH_LAN_IP:-$(detect_ip)}"
# mDNS name (probe target for the CA-install banner). Devices resolve
# <hostname>.local over mDNS; the server should run avahi-daemon.
HOSTNAME="${DSH_HOSTNAME:-$(hostname)}"
# Tailnet IPv4 (if Tailscale is up): so certs also cover https://100.x:3081
# served through the LAN proxy, keeping the CA-install flow consistent.
TS_IP=""
if command -v tailscale >/dev/null 2>&1; then
    TS_IP="$(tailscale ip -4 2>/dev/null | head -1 || true)"
fi
CERT="$CERT_DIR/dsh.crt"
KEY="$CERT_DIR/dsh.key"
CA_CERT="$CA_DIR/ca.crt"
CA_KEY="$CA_DIR/ca.key"
DAYS=825     # ~27 months, then auto-renewed by re-running this script
CA_DAYS=3650

mkdir -p "$CERT_DIR" "$CA_DIR" "$WORK_DIR"
trap 'rm -rf "$WORK_DIR"' EXIT

# Already good? leaf present, not expiring within 30 days, SAN covers the
# current LAN IP.
if [ -f "$CERT" ] && [ -f "$KEY" ] && [ -f "$CA_CERT" ] && \
   openssl x509 -in "$CERT" -noout -checkend 2592000 >/dev/null 2>&1 && \
   openssl x509 -in "$CERT" -noout -ext subjectAltName 2>/dev/null | grep -Fq "IP Address:$LAN_IP"; then
    echo "[gen-cert] cert up to date for $LAN_IP"
    exit 0
fi

# Stable local CA, created once (req -x509 emits the CA basicConstraints).
if [ ! -f "$CA_KEY" ] || [ ! -f "$CA_CERT" ]; then
    echo "[gen-cert] creating local CA (caddy/certs/ca/ — install caddy/certs/ca/ca.crt on your devices)"
    openssl req -x509 -newkey rsa:2048 -nodes -days "$CA_DAYS" \
        -keyout "$CA_KEY" -out "$CA_CERT" \
        -subj "/CN=dsh-lan-ca (install this CA on your devices)" 2>>"$WORK_DIR/gen.log"
    chmod 600 "$CA_KEY"
    chmod 644 "$CA_CERT"
fi

echo "[gen-cert] generating server cert for $LAN_IP ..."
openssl req -newkey rsa:2048 -nodes \
    -keyout "$KEY" -out "$WORK_DIR/dsh.csr" \
    -subj "/CN=$LAN_IP" 2>>"$WORK_DIR/gen.log"
chmod 600 "$KEY"

cat > "$WORK_DIR/dsh.ext" <<EOF
subjectAltName=IP:$LAN_IP,IP:127.0.0.1,DNS:localhost,DNS:$HOSTNAME.local$(if [ -n "$TS_IP" ]; then printf ",IP:%s" "$TS_IP"; fi)
basicConstraints=CA:FALSE
keyUsage=digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
EOF

openssl x509 -req -in "$WORK_DIR/dsh.csr" \
    -CA "$CA_CERT" -CAkey "$CA_KEY" -CAcreateserial \
    -days "$DAYS" -out "$CERT" -extfile "$WORK_DIR/dsh.ext" 2>>"$WORK_DIR/gen.log"

# Fullchain: leaf + CA — clients that have the CA installed validate the leaf
# directly; clients that do not still receive the issuer chain.
cp "$CERT" "$WORK_DIR/leaf.crt"
cat "$WORK_DIR/leaf.crt" "$CA_CERT" > "$CERT"

rm -rf "$WORK_DIR"
echo "[gen-cert] cert regenerated for $LAN_IP (restart caddy to pick it up)"
exit 10