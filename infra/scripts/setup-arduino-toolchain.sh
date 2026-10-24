#!/usr/bin/env bash
# Installs the pinned PinFlow compile toolchain (apps/compile-worker/toolchain.lock.json)
# into <repo>/.arduino-cache (gitignored). Idempotent. Needs network ONCE; the compile worker
# itself never installs anything.
#
#   infra/scripts/setup-arduino-toolchain.sh
#   ARDUINO_CACHE_DIR=/opt/pinflow/arduino infra/scripts/setup-arduino-toolchain.sh
#
# The ESP32 core is ~2 GB extracted; on small machines run it detached (setsid nohup … &) and
# poll. If extraction is OOM-killed, set GOMEMLIMIT=256MiB and re-run (downloads are cached).
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
LOCK="$REPO/apps/compile-worker/toolchain.lock.json"
CACHE="${ARDUINO_CACHE_DIR:-$REPO/.arduino-cache}"
jqr() { python3 -c "import json;d=json.load(open('$LOCK'));print($1)"; }

CLI_VERSION="$(jqr "d['arduinoCli']['version']")"
case "$(uname -m)" in
  aarch64|arm64) ASSET="arduino-cli_${CLI_VERSION}_Linux_ARM64.tar.gz" ;;
  x86_64|amd64)  ASSET="arduino-cli_${CLI_VERSION}_Linux_64bit.tar.gz" ;;
  *) echo "unsupported arch $(uname -m)" >&2; exit 1 ;;
esac
mkdir -p "$CACHE/bin" "$CACHE/data" "$CACHE/downloads" "$CACHE/user" "$CACHE/home" "$CACHE/build-cache"

if ! "$CACHE/bin/arduino-cli" version 2>/dev/null | grep -q "Version: $CLI_VERSION "; then
  tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
  base="https://github.com/arduino/arduino-cli/releases/download/v${CLI_VERSION}"
  curl -fsSL -o "$tmp/$ASSET" "$base/$ASSET"
  curl -fsSL -o "$tmp/checksums.txt" "$base/${CLI_VERSION}-checksums.txt"
  (cd "$tmp" && grep " $ASSET\$" checksums.txt | sha256sum -c -)
  tar -xzf "$tmp/$ASSET" -C "$CACHE/bin" arduino-cli
fi
"$CACHE/bin/arduino-cli" version

cat > "$CACHE/arduino-cli.yaml" <<YAML
board_manager:
  additional_urls:
$(python3 -c "import json;[print('    - '+u) for u in json.load(open('$LOCK'))['boardManagerUrls']]")
directories:
  data: $CACHE/data
  downloads: $CACHE/downloads
  user: $CACHE/user
build_cache:
  path: $CACHE/build-cache
library:
  enable_unsafe_install: false
network:
  connection_timeout: 300s
metrics:
  enabled: false
updater:
  enable_notification: false
YAML

C=("$CACHE/bin/arduino-cli" --config-file "$CACHE/arduino-cli.yaml")
export HOME="$CACHE/home"
"${C[@]}" core update-index
for p in $(python3 -c "import json;[print(p['id']+'@'+p['version']) for p in json.load(open('$LOCK'))['platforms']]"); do
  "${C[@]}" core install "$p"
done
"${C[@]}" lib update-index
python3 -c "import json;[print(l['name']+'@'+l['version']) for l in json.load(open('$LOCK'))['libraries']]" | while IFS= read -r lib; do
  "${C[@]}" lib install --no-deps "$lib"
done
"${C[@]}" core list
"${C[@]}" lib list
echo "Toolchain ready in $CACHE"
