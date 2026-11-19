import type { RequestHandler } from 'express';
import { ApiError } from '../utils/ApiError.js';
import { AUTH_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../utils/jwt.js';

export const requireAuth: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[AUTH_COOKIE];
  if (typeof token !== 'string' || token.length === 0) {
    return next(ApiError.unauthorized());
  }
  const auth = verifyAccessToken(token);
  if (!auth) {
    return next(ApiError.unauthorized('Session is invalid or has expired'));
  }
  req.auth = auth;
  next();
};
