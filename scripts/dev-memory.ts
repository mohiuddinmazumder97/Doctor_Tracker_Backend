/**
 * Runs the API against a throwaway in-memory MongoDB, pre-seeded with demo data.
 * Useful for trying the project without an Atlas cluster (or when Atlas is unreachable).
 *
 *   npm run dev:memory
 *
 * Data is lost when the process stops.
 */
import { spawn } from 'node:child_process';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

const mongo = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const uri = mongo.getUri();
console.log(`In-memory MongoDB ready (${uri})`);

// Real env vars take precedence over --env-file values, so this overrides MONGODB_URI from .env.
const env = {
  ...process.env,
  MONGODB_URI: uri,
  MONGODB_DB_NAME: 'doctor_tracker',
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  // Lets the project run with zero configuration; a real .env value wins when present.
  JWT_SECRET: process.env.JWT_SECRET ?? 'dev-memory-only-secret-not-for-production-use-0123456789',
};
const tsx = process.platform === 'win32' ? 'tsx.cmd' : 'tsx';
const envFileArgs = ['--env-file-if-exists=.env'];

function run(args: string[], { watch = false } = {}) {
  // tsx requires the `watch` subcommand before any flags.
  return spawn(tsx, [...(watch ? ['watch'] : []), ...envFileArgs, ...args], { env, stdio: 'inherit' });
}

const seed = run(['scripts/seed.ts']);
const seedCode: number = await new Promise((resolve) => seed.on('exit', (code) => resolve(code ?? 1)));
if (seedCode !== 0) {
  await mongo.stop();
  process.exit(seedCode);
}

const server = run(['src/server.ts'], { watch: true });

const shutdown = async () => {
  server.kill('SIGTERM');
  await mongo.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
