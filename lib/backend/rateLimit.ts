type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const requestsByUser = new Map<string, RateLimitEntry>();
const windowMs = 60_000;
const maxRequests = 10;

export class RateLimitError extends Error {
  retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super("RATE_LIMITED");
    this.name = "RateLimitError";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function enforceRateLimit(userId: string) {
  const rate = checkRateLimit(userId);

  if (!rate.allowed) {
    throw new RateLimitError(rate.retryAfter || 1);
  }
}

export function checkRateLimit(userId: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  const now = Date.now();
  const existing = requestsByUser.get(userId);

  if (!existing || existing.resetAt <= now) {
    requestsByUser.set(userId, { count: 1, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfter: Math.ceil((existing.resetAt - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true };
}
