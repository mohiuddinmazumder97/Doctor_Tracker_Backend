import mongoose from 'mongoose';
import { createApp } from './app.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';

async function main() {
  await connectDatabase();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
    // Force-exit if connections do not drain in time.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  if (err instanceof mongoose.Error.MongooseServerSelectionError) {
    // The driver's error dumps the whole replica-set topology; print what to do instead.
    logger.fatal(
      [
        'Could not reach MongoDB.',
        '  • Atlas: add this machine’s IP under Security → Network Access (or 0.0.0.0/0 for hosted deploys),',
        '    wait for the entry to become Active, and check MONGODB_URI credentials.',
        '  • No database handy? Run `npm run dev:memory` for a seeded in-memory MongoDB.',
        `  Driver message: ${err.message.split('. ')[0]}.`,
      ].join('\n'),
    );
  } else {
    logger.fatal({ err }, 'Failed to start server');
  }
  process.exit(1);
});
