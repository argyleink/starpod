/**
 * Fixed-window rate limiting for API routes, scoped to a single deployed
 * instance. Good enough to signal real limits on the write-side contact
 * endpoint; not a substitute for a shared store (Upstash, Vercel KV, etc.)
 * if this ever needs to hold across multiple instances/regions.
 */

interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch seconds the current window resets at. */
  resetAt: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(
  key: string,
  { limit, windowMs }: RateLimitOptions
): RateLimitResult {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return {
      allowed: true,
      limit,
      remaining: limit - 1,
      resetAt: Math.ceil(resetAt / 1000)
    };
  }

  bucket.count += 1;

  return {
    allowed: bucket.count <= limit,
    limit,
    remaining: Math.max(0, limit - bucket.count),
    resetAt: Math.ceil(bucket.resetAt / 1000)
  };
}

/** Derives a rate-limit key from the client's IP, falling back to a shared
 * bucket if no forwarding header is present (e.g. local dev). */
export function clientKey(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'unknown';
}

export function rateLimitHeaders(
  result: RateLimitResult
): Record<string, string> {
  return {
    'RateLimit-Limit': String(result.limit),
    'RateLimit-Remaining': String(result.remaining),
    'RateLimit-Reset': String(result.resetAt)
  };
}

/** Test-only: clears all bucket state between test cases. */
export function __resetRateLimitBucketsForTests(): void {
  buckets.clear();
}
