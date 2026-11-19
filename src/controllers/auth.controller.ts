import type { Request, Response } from 'express';
import * as authService from '../services/auth.service.js';
import { ApiError } from '../utils/ApiError.js';
import { clearAuthCookie, setAuthCookie } from '../utils/cookies.js';
import { sendSuccess } from '../utils/response.js';
import { parse } from '../utils/validate.js';
import { loginSchema } from '../validators/auth.validator.js';

export async function login(req: Request, res: Response) {
  const input = parse(loginSchema, req.body);
  const { admin, token } = await authService.login(input);
  setAuthCookie(res, token);
  // The token is deliberately NOT returned in the body — it lives only in the HTTP-only cookie.
  sendSuccess(res, { admin });
}

export function logout(_req: Request, res: Response) {
  clearAuthCookie(res);
  res.status(204).end();
}

export async function me(req: Request, res: Response) {
  if (!req.auth) throw ApiError.unauthorized();
  try {
    const admin = await authService.getCurrentAdmin(req.auth.adminId);
    sendSuccess(res, { admin });
  } catch (error) {
    // Valid signature but the admin no longer exists: end the session.
    if (error instanceof ApiError && error.statusCode === 401) clearAuthCookie(res);
    throw error;
  }
}
