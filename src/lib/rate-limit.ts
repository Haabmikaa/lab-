// lib/rate-limit.ts — Simple in-memory rate limiter for auth endpoints
// For production, use Redis-backed rate limiting (e.g. @upstash/ratelimit)

type RateLimitRecord = {
  count: number
  resetAt: number
  lockedUntil?: number
}

const store = new Map<string, RateLimitRecord>()

export function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number,
  lockoutMs: number,
): { allowed: boolean; remaining: number; retryAfterMs?: number } {
  const now = Date.now()
  const record = store.get(key)

  // Check lockout
  if (record?.lockedUntil && record.lockedUntil > now) {
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: record.lockedUntil - now,
    }
  }

  // Reset window
  if (!record || record.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true, remaining: maxAttempts - 1 }
  }

  record.count += 1

  if (record.count > maxAttempts) {
    record.lockedUntil = now + lockoutMs
    return { allowed: false, remaining: 0, retryAfterMs: lockoutMs }
  }

  return { allowed: true, remaining: maxAttempts - record.count }
}

// Clean up old entries periodically (every 10 minutes)
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, record] of store.entries()) {
      if (record.resetAt < now && (!record.lockedUntil || record.lockedUntil < now)) {
        store.delete(key)
      }
    }
  }, 10 * 60 * 1000)
}

