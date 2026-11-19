import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { AUTH_COOKIE, clearAuthCookie } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth: RequestHandler = (req, res, next) => {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof token !== 'string' || token.length === 0) {
    return next(ApiError.unauthorized());
  }
  const auth = verifyAccessToken(token);
  if (!auth) {
    // Clear the rejected cookie: it is HTTP-only, so the browser app cannot remove it itself,
    // and leaving it would make the frontend's route guard think a session still exists.
    clearAuthCookie(res);
    return next(ApiError.unauthorized('Session is invalid or has expired'));
  }
  req.auth = auth;
  next();
};
