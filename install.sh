#!/usr/bin/env bash
# install.sh — wire dsh-lan-manager into a dsh web profile.
#
# Portable installer for this deploy directory:
#   1. symlinks this package into $PROFILE/plugins/dsh-lan-manager,
#   2. adds the plugin dependency to $PROFILE/package.json,
#   3. appends the lan-manager row to $PROFILE/cordis.patch.yml,
#   4. runs pnpm install in the profile.
#
# Overrides:
#   DSH_PROFILE_DIR  profile directory (default $HOME/.dsh/profiles/web)
#   DSH_LAN_PORT     external https port (default 3081)
#   DSH_LOCAL_PORT   dsh loopback port the proxy fronts (default 3080)
#   DSH_TAILSCALE_PORT internal loopback port for Tailscale (default 3082)
#
# After install: restart dsh web (or `dsh --lan`), open 设置 → 远程访问.
set -euo pipefail

REPO="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
PROFILE="${DSH_PROFILE_DIR:-$HOME/.dsh/profiles/web}"
PORT="${DSH_LAN_PORT:-3081}"
LOCAL_PORT="${DSH_LOCAL_PORT:-3080}"
TAILSCALE_PORT="${DSH_TAILSCALE_PORT:-3082}"

if [ ! -d "$PROFILE" ]; then
    echo "[install] ERROR: profile not found: $PROFILE (set DSH_PROFILE_DIR)" >&2
    exit 1
fi
PNPM="$(command -v pnpm 2>/dev/null || true)"
if [ -z "$PNPM" ] && [ -x "$PROFILE/../../node_modules/.bin/pnpm" ]; then
    PNPM="$PROFILE/../../node_modules/.bin/pnpm"
fi
if [ -z "$PNPM" ]; then
    echo "[install] WARNING: pnpm not found; package linking must be done manually with 'pnpm install' in $PROFILE" >&2
fi

echo "[install] linking plugin into $PROFILE/plugins ..."
mkdir -p "$PROFILE/plugins"
ln -sfn "$REPO" "$PROFILE/plugins/dsh-lan-manager"

echo "[install] adding dependency to $PROFILE/package.json ..."
python3 - "$PROFILE/package.json" <<'PY'
import json, sys
p = sys.argv[1]
with open(p) as f:
    data = json.load(f)
data.setdefault("dependencies", {})
data["dependencies"]["dsh-lan-manager"] = "file:./plugins/dsh-lan-manager"
with open(p, "w") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)
    f.write("\n")
PY

echo "[install] appending lan-manager row to $PROFILE/cordis.patch.yml ..."
PATCH="$PROFILE/cordis.patch.yml"
if ! grep -q "dsh-lan-manager" "$PATCH" 2>/dev/null; then
    cat >> "$PATCH" <<EOF
- insert:
    - id: lan-manager
      name: dsh-lan-manager
      config:
        port: $PORT
        localPort: $LOCAL_PORT
        tailscalePort: $TAILSCALE_PORT
        tailscale: true
        certNotice: false
EOF
else
    echo "[install] row already present, skipped"
fi

if [ -n "$PNPM" ]; then
    echo "[install] running pnpm install in $PROFILE ..."
    (cd "$PROFILE" && CI=true "$PNPM" install --no-frozen-lockfile)
else
    echo "[install] skipped pnpm install (pnpm not found)"
fi

echo
echo "[install] done. Next steps:"
echo "  1. restart dsh web:  dsh --lan   (or relaunch your dsh process)"
echo "  2. open the UI, 设置 → 远程访问 — one-click bring-up and checks"
echo "  3. optional: enable '证书安装提示' there to show the CA-install banner"
