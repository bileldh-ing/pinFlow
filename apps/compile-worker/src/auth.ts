import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Constant-time bearer token check (hashing first equalises lengths). */
export function checkBearer(header: string | undefined, expected: string): boolean {
  if (!header || !expected) return false;
  const m = /^Bearer ([^\s]+)$/.exec(header);
  if (!m) return false;
  return timingSafeEqual(digest(m[1]!), digest(expected));
}

export function tokenKey(token: string): string {
  return digest(token).toString("hex").slice(0, 16);
}

/** Simple token bucket keyed by caller (token hash [+ user id]). */
export class RateLimiter {
  private buckets = new Map<string, { tokens: number; updated: number }>();
  constructor(
    private readonly capacity: number,
    private readonly refillPerMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  static perMinute(n: number, now?: () => number) {
    return new RateLimiter(n, n / 60_000, now);
  }

  /** Returns 0 when allowed, otherwise ms until a token is available. */
  take(key: string): number {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updated: t };
    b.tokens = Math.min(this.capacity, b.tokens + (t - b.updated) * this.refillPerMs);
    b.updated = t;
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.buckets.clear(); // crude memory bound
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return 0;
    }
    return Math.ceil((1 - b.tokens) / this.refillPerMs);
  }
}
