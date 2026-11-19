import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiRateLimiter } from './middlewares/rateLimit.js';
import { apiRouter } from './routes/index.js';
import { logger } from './utils/logger.js';

export function createApp() {
  const app = express();

  // Render (and the Vercel rewrite) sit in front of the app; trust their X-Forwarded-* headers
  // so req.ip / secure cookies work. The hop count is configurable per deployment.
  app.set('trust proxy', Number(process.env.TRUST_PROXY ?? 1));
  app.disable('x-powered-by');

  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => {
        // Non-browser clients (curl, server-to-server via the Next.js proxy) send no Origin.
        if (!origin || env.CORS_ORIGINS.includes(origin)) return callback(null, true);
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());
  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));

  // Interactive API docs (public; the spec contains no secrets). Mounted before the
  // authenticated router so the docs themselves don't require a session.
  const openApiDocument = buildOpenApiDocument();
  app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));
  app.use(
    '/api/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: 'Doctor Tracker API docs',
      swaggerOptions: { withCredentials: true, displayRequestDuration: true, tryItOutEnabled: true },
    }),
  );

  app.use('/api', apiRateLimiter, apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
