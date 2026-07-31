/**
 * Per-session token bucket for live-mode model calls. In-memory, keyed by an
 * httpOnly session cookie set on first request. Deliberately uses the wall
 * clock (`Date.now()`) — this is infrastructure, not graded logic, and it
 * lives in src/server/, never src/core/, per the build plan's carve-out for
 * exactly this kind of thing. 10 calls per session per 10 minutes: the free
 * tier rate-limits per model regardless, so this exists to keep one
 * reviewer's live-mode exploration from exhausting everyone else's share.
 */

const MAX_CALLS_PER_WINDOW = 10;
const WINDOW_MS = 10 * 60 * 1000;

interface Bucket {
  count: number;
  windowStartedAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(sessionId: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(sessionId);

  if (!existing || now - existing.windowStartedAt > WINDOW_MS) {
    buckets.set(sessionId, { count: 1, windowStartedAt: now });
    return { allowed: true, remaining: MAX_CALLS_PER_WINDOW - 1, resetAt: now + WINDOW_MS };
  }

  if (existing.count >= MAX_CALLS_PER_WINDOW) {
    return { allowed: false, remaining: 0, resetAt: existing.windowStartedAt + WINDOW_MS };
  }

  existing.count += 1;
  return { allowed: true, remaining: MAX_CALLS_PER_WINDOW - existing.count, resetAt: existing.windowStartedAt + WINDOW_MS };
}

/** Generates a random session id for the first-request cookie. Not a security token — just a bucketing key. */
export function generateSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
