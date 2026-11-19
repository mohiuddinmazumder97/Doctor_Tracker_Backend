import bcrypt from 'bcrypt';
import { AdminModel } from '../models/admin.model.js';
import { ApiError } from '../utils/ApiError.js';
import { signAccessToken } from '../utils/jwt.js';
import type { LoginInput } from '../validators/auth.validator.js';

export const BCRYPT_ROUNDS = 12;

// Compared against when the email is unknown, so response time does not reveal
// whether an account exists (user-enumeration via timing).
const DUMMY_HASH = bcrypt.hashSync('timing-attack-mitigation', BCRYPT_ROUNDS);

export interface PublicAdmin {
  _id: string;
  name: string;
  email: string;
  role: 'admin';
}

function toPublicAdmin(admin: { _id: unknown; name: string; email: string }): PublicAdmin {
  return { _id: String(admin._id), name: admin.name, email: admin.email, role: 'admin' };
}

export async function login({ email, password }: LoginInput) {
  const admin = await AdminModel.findOne({ email }).select('+passwordHash').lean();
  const passwordMatches = await bcrypt.compare(password, admin?.passwordHash ?? DUMMY_HASH);

  if (!admin || !passwordMatches) {
    // Same message for both cases — do not reveal which part was wrong.
    throw ApiError.unauthorized('Invalid email or password');
  }

  const token = signAccessToken({ adminId: String(admin._id), role: 'admin' });
  return { admin: toPublicAdmin(admin), token };
}

export async function getCurrentAdmin(adminId: string): Promise<PublicAdmin> {
  const admin = await AdminModel.findById(adminId).select('name email').lean();
  // The token may outlive the account (e.g. admin deleted) — treat as unauthenticated.
  if (!admin) throw ApiError.unauthorized('Session is no longer valid');
  return toPublicAdmin(admin);
}

export function hashPassword(password: string) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}
