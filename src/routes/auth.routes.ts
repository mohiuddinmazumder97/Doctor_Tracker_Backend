import { Router } from 'express';
import * as authController from '../controllers/auth.controller.js';
import { loginRateLimiter } from '../middlewares/rateLimit.js';
import { requireAuth } from '../middlewares/requireAuth.js';

export const authRouter = Router();

authRouter.post('/login', loginRateLimiter, authController.login);
authRouter.post('/logout', authController.logout);
authRouter.get('/me', requireAuth, authController.me);
