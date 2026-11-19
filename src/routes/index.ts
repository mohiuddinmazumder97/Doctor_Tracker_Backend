import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth } from '../middlewares/requireAuth.js';
import { authRouter } from './auth.routes.js';

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  const dbReady = mongoose.connection.readyState === 1;
  res.status(dbReady ? 200 : 503).json({ success: dbReady, data: { status: dbReady ? 'ok' : 'degraded' } });
});

apiRouter.use('/auth', authRouter);

// Everything registered below this line requires authentication.
apiRouter.use(requireAuth);
