# syntax=docker/dockerfile:1.7
#
# PinFlow compile worker – PRODUCTION IMAGE SKETCH.
# !! NOT BUILT OR TESTED: the development machine has no Docker. Treat as a reviewed starting point.
#
# Build (from repo root):  docker build -f infra/docker/compile-worker.Dockerfile -t pinflow/compile-worker .
# Run (see infra/docker/README.md for the full hardened flag set and gVisor runtime):
#   docker run --runtime=runsc --read-only --tmpfs /tmp:rw,size=1g,mode=1777 \
#     --cap-drop=ALL --security-opt no-new-privileges --pids-limit 256 --memory 3g --cpus 2 \
#     --network pinflow-internal -e COMPILE_WORKER_TOKEN=... -p 127.0.0.1:4100:4100 pinflow/compile-worker

############################ 1. toolchain (needs network, build time only) ############################
FROM debian:bookworm-slim AS toolchain
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl python3 && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY apps/compile-worker/toolchain.lock.json apps/compile-worker/toolchain.lock.json
COPY infra/scripts/setup-arduino-toolchain.sh infra/scripts/setup-arduino-toolchain.sh
ENV ARDUINO_CACHE_DIR=/opt/pinflow/arduino
RUN infra/scripts/setup-arduino-toolchain.sh \
 && rm -rf /opt/pinflow/arduino/downloads/* \
 # pre-warm the core build cache for every allowlisted board so job builds stay fast
 && mkdir -p /tmp/warm/warm && printf 'void setup(){}\nvoid loop(){}\n' > /tmp/warm/warm/warm.ino \
 && for f in arduino:avr:uno arduino:avr:nano arduino:avr:mega esp32:esp32:esp32; do \
      HOME=/opt/pinflow/arduino/home /opt/pinflow/arduino/bin/arduino-cli --config-file /opt/pinflow/arduino/arduino-cli.yaml \
        compile --fqbn "$f" /tmp/warm/warm; done \
 # no --build-path on purpose: arduino-cli 1.5 only fills build-cache/cores without it
 && rm -rf /tmp/warm /opt/pinflow/arduino/build-cache/sketches

############################ 2. node deps ############################
FROM node:22-bookworm-slim AS deps
RUN corepack enable
WORKDIR /app
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/compile-worker/package.json apps/compile-worker/package.json
RUN pnpm install --frozen-lockfile --filter @pinflow/compile-worker...

############################ 3. runtime ############################
FROM node:22-bookworm-slim AS runtime
# util-linux provides prlimit (per-job rlimits inside the container)
RUN apt-get update && apt-get install -y --no-install-recommends util-linux tini && rm -rf /var/lib/apt/lists/* \
 && groupadd -g 10001 pinflow && useradd -u 10001 -g pinflow -M -s /usr/sbin/nologin pinflow \
 && mkdir -p /var/lib/pinflow/home && chown pinflow:pinflow /var/lib/pinflow/home
COPY --from=toolchain --chown=root:root /opt/pinflow/arduino /opt/pinflow/arduino
# NOTE (untested): arduino-cli may update build-cache entries (last-used tracking). If a read-only
# cache breaks builds, mount /opt/pinflow/arduino/build-cache as a writable volume that is NOT shared
# across tenants' worker pools.
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/compile-worker/node_modules ./apps/compile-worker/node_modules
COPY apps/compile-worker ./apps/compile-worker
ENV NODE_ENV=production \
    PORT=4100 HOST=0.0.0.0 \
    ARDUINO_CACHE_DIR=/opt/pinflow/arduino \
    COMPILE_HOME_DIR=/var/lib/pinflow/home \
    COMPILE_WORK_ROOT=/tmp \
    COMPILE_CONCURRENCY=1 \
    COMPILE_RLIMIT_NPROC=256
USER 10001:10001
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4100/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "--import", "tsx", "apps/compile-worker/src/main.ts"]
