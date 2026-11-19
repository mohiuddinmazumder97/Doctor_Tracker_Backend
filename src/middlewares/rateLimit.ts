import { rateLimit, ipKeyGenerator } from 'express-rate-limit';

const rateLimitResponse = (message: string) => ({
  success: false,
  error: { code: 'TOO_MANY_REQUESTS', message },
});

/** Brute-force protection for login: keyed by IP + submitted email, failures only. */
export const loginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const body: unknown = req.body;
    const email =
      body && typeof body === 'object' && 'email' in body && typeof body.email === 'string'
        ? body.email.toLowerCase().slice(0, 254)
        : '';
    return `${ipKeyGenerator(req.ip ?? 'unknown')}:${email}`;
  },
  message: rateLimitResponse('Too many login attempts. Please try again in 15 minutes.'),
});

/** Coarse protection for the whole API. */
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: rateLimitResponse('Too many requests. Please slow down.'),
});
