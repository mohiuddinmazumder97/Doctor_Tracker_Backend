export interface AuthContext {
  adminId: string;
  role: 'admin';
}

declare global {
  namespace Express {
    interface Request {
      /** Populated by the requireAuth middleware. */
      auth?: AuthContext;
    }
  }
}
