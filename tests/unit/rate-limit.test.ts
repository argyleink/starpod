import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  __resetRateLimitBucketsForTests,
  checkRateLimit,
  clientKey,
  rateLimitHeaders
} from 'starpod/src/lib/rate-limit';

describe('rate-limit', () => {
  afterEach(() => {
    __resetRateLimitBucketsForTests();
    vi.useRealTimers();
  });

  it('allows requests up to the limit within the window', () => {
    const opts = { limit: 3, windowMs: 60_000 };

    const first = checkRateLimit('client-a', opts);
    const second = checkRateLimit('client-a', opts);
    const third = checkRateLimit('client-a', opts);

    expect(first.allowed).toBe(true);
    expect(first.remaining).toBe(2);
    expect(second.remaining).toBe(1);
    expect(third.remaining).toBe(0);
  });

  it('rejects requests once the limit is exceeded', () => {
    const opts = { limit: 2, windowMs: 60_000 };

    checkRateLimit('client-b', opts);
    checkRateLimit('client-b', opts);
    const third = checkRateLimit('client-b', opts);

    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
  });

  it('tracks separate clients independently', () => {
    const opts = { limit: 1, windowMs: 60_000 };

    const a = checkRateLimit('client-c', opts);
    const b = checkRateLimit('client-d', opts);

    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });

  it('resets the window once it elapses', () => {
    vi.useFakeTimers();
    const opts = { limit: 1, windowMs: 1_000 };

    const first = checkRateLimit('client-e', opts);
    expect(first.allowed).toBe(true);

    const blocked = checkRateLimit('client-e', opts);
    expect(blocked.allowed).toBe(false);

    vi.advanceTimersByTime(1_001);

    const afterWindow = checkRateLimit('client-e', opts);
    expect(afterWindow.allowed).toBe(true);
    expect(afterWindow.remaining).toBe(0);
  });

  it('derives the client key from x-forwarded-for, taking the first hop', () => {
    const request = new Request('http://localhost/api/contact', {
      headers: { 'x-forwarded-for': '203.0.113.4, 10.0.0.1' }
    });

    expect(clientKey(request)).toBe('203.0.113.4');
  });

  it('falls back to a shared key when there is no forwarding header', () => {
    const request = new Request('http://localhost/api/contact');

    expect(clientKey(request)).toBe('unknown');
  });

  it('formats standard RateLimit-* headers', () => {
    const headers = rateLimitHeaders({
      allowed: true,
      limit: 5,
      remaining: 4,
      resetAt: 1_700_000_000
    });

    expect(headers).toEqual({
      'RateLimit-Limit': '5',
      'RateLimit-Remaining': '4',
      'RateLimit-Reset': '1700000000'
    });
  });
});
