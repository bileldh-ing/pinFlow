#!/usr/bin/env bash
# Re-captures the real arduino-cli outputs used by apps/compile-worker/test/diagnostics.test.ts.
# Sketches are compiled from /tmp/pinflow-capture/<sketch> (the tests map that prefix back to
# relative paths). Usage: infra/scripts/capture-compile-outputs.sh [text|json] [sketch...]
set -euo pipefail
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
D="${ARDUINO_CACHE_DIR:-$REPO/.arduino-cache}"
F="$REPO/fixtures/compile"; CAP="$F/captured"; T=/tmp/pinflow-capture
mode="${1:-text}"; shift || true
sketches=("${@:-broken-uno missing-header-uno linker-error-uno}")
mkdir -p "$CAP" "$T" "$D/home"
for s in ${sketches[@]}; do
  rm -rf "$T/$s" "$T/build-$s"; cp -r "$F/$s" "$T/"
  args=(--config-file "$D/arduino-cli.yaml" compile --fqbn arduino:avr:uno --warnings default --build-path "$T/build-$s" --no-color)
  if [ "$mode" = json ]; then
    env -i PATH=/usr/bin:/bin HOME="$D/home" LC_ALL=C "$D/bin/arduino-cli" "${args[@]}" --json "$T/$s" > "$T/$s.json" 2>/dev/null || true
    # drop build_properties (huge, machine specific) and anonymise the cache path
    python3 - "$T/$s.json" "$CAP/$s.avr.cli.json" "$D" <<'PY'
import json,sys
d=json.load(open(sys.argv[1]))
(d.get('builder_result') or {}).pop('build_properties',None)
open(sys.argv[2],'w').write(json.dumps(d,indent=2).replace(sys.argv[3],'/opt/pinflow/.arduino-cache')+"\n")
PY
  else
    (cd "$T" && env -i PATH=/usr/bin:/bin HOME="$D/home" LC_ALL=C "$D/bin/arduino-cli" "${args[@]}" "$T/$s" > "$CAP/$s.avr.txt" 2>&1 || true)
    sed -i "s#$D#/opt/pinflow/.arduino-cache#g" "$CAP/$s.avr.txt"
  fi
  echo "captured $s ($mode)"
done
