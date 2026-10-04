import type { Request, RequestHandler } from 'express';

type Bucket = { count: number; resetAt: number };

export type RateLimitOptions = {
  limit: number;
  windowMs: number;
  key: (request: Request) => string;
  now?: () => number;
};

export function fixedWindowRateLimit(options: RateLimitOptions): RequestHandler {
  const buckets = new Map<string, Bucket>();
  const now = options.now ?? Date.now;
  if (!Number.isInteger(options.limit) || options.limit < 1) throw new Error('INVALID_RATE_LIMIT');
  if (!Number.isInteger(options.windowMs) || options.windowMs < 1)
    throw new Error('INVALID_RATE_WINDOW');

  return (request, response, next) => {
    const timestamp = now();
    const key = options.key(request);
    const previous = buckets.get(key);
    const bucket =
      !previous || previous.resetAt <= timestamp
        ? { count: 0, resetAt: timestamp + options.windowMs }
        : previous;
    bucket.count += 1;
    buckets.set(key, bucket);

    if (buckets.size > 10_000) {
      for (const [candidate, value] of buckets)
        if (value.resetAt <= timestamp) buckets.delete(candidate);
      if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value as string);
    }

    response.setHeader('RateLimit-Limit', String(options.limit));
    response.setHeader('RateLimit-Remaining', String(Math.max(0, options.limit - bucket.count)));
    response.setHeader('RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));
    if (bucket.count <= options.limit) return next();

    response.setHeader(
      'Retry-After',
      String(Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000))),
    );
    return response.status(429).json({ code: 'RATE_LIMITED' });
  };
}
