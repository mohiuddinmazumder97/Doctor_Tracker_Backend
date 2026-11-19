import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import type { AuthContext } from '../types/express.js';

const ISSUER = 'doctor-tracker-api';

export function signAccessToken(payload: AuthContext): string {
  return jwt.sign({ role: payload.role }, env.JWT_SECRET, {
    subject: payload.adminId,
    issuer: ISSUER,
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions['expiresIn'],
  });
}

/** Returns the auth context, or null for any invalid/expired/tampered token. */
export function verifyAccessToken(token: string): AuthContext | null {
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET, { issuer: ISSUER, algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub || decoded.role !== 'admin') return null;
    return { adminId: decoded.sub, role: 'admin' };
  } catch {
    return null;
  }
}
