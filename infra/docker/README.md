# infra/docker — compile worker container (production plan)

**Status: written, NOT built.** The development sandbox has no Docker daemon and no root, so
`compile-worker.Dockerfile` has never been built or run. Expect small fixes on first build.

## What the image does
1. `toolchain` stage installs the pinned arduino-cli / cores / libraries from
   `apps/compile-worker/toolchain.lock.json` via `infra/scripts/setup-arduino-toolchain.sh`
   (the only stage with network; verifies the CLI tarball checksum) and pre-warms the core build
   cache for every allowlisted FQBN.
2. `runtime` stage runs the worker as uid 10001 with the toolchain owned by root (read-only for
   the worker), `tini` as PID 1 and `prlimit` available for per-job rlimits.

## Required runtime hardening (orchestrator flags)
| Control | Docker / k8s setting |
|---|---|
| Kernel isolation | `--runtime=runsc` (gVisor) or Kata/Firecracker microVM |
| Non-root | image `USER 10001`; k8s `runAsNonRoot: true`, `allowPrivilegeEscalation: false` |
| Capabilities | `--cap-drop=ALL`, `--security-opt no-new-privileges`, default seccomp |
| Filesystem | `--read-only` rootfs, `--tmpfs /tmp:size=1g`, writable `/var/lib/pinflow/home` (emptyDir) |
| Processes | `--pids-limit 256` (cgroup pids; stronger than RLIMIT_NPROC) |
| Memory / CPU | `--memory 3g --memory-swap 3g --cpus 2` |
| Network | reachable only from the API on an internal network; **egress deny-all** (NetworkPolicy without egress rules); block 169.254.169.254 |
| Secrets | only `COMPILE_WORKER_TOKEN`; no DB/cloud credentials; `automountServiceAccountToken: false` |
| Lifetime | recycle containers every N jobs/hours |

## Stronger per-job isolation (next step)
Today every job is a child process inside the worker container. For multi-tenant SaaS the target
is one disposable sandbox per job (`runsc run` or a Firecracker snapshot) with the toolchain
mounted read-only, `--network none`, and only the build output copied back. The `CompileRunner`
interface in `apps/compile-worker/src/runner.ts` is the seam: add a `SandboxedRunner`.
