import type { CookieOptions, Response } from 'express';
import { durationToMs, env, isProduction } from '../config/env.js';

export const AUTH_COOKIE = 'dt_access_token';

/**
 * The frontend proxies /api/* through its own origin (Next.js rewrites), so the
 * cookie is first-party and SameSite=Lax works in every browser — no need for
 * SameSite=None, which Safari/ITP and third-party-cookie blocking would break.
 */
const baseOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/',
};

export function setAuthCookie(res: Response, token: string) {
  res.cookie(AUTH_COOKIE, token, { ...baseOptions, maxAge: durationToMs(env.JWT_EXPIRES_IN) });
}

export function clearAuthCookie(res: Response) {
  res.clearCookie(AUTH_COOKIE, baseOptions);
}
