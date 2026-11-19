import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Env must be set before src/config/env.ts is imported; the real URI comes from the in-memory server.
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://placeholder',
      JWT_SECRET: 'test-secret-that-is-definitely-at-least-32-characters-long',
      JWT_EXPIRES_IN: '1h',
      CORS_ORIGINS: 'http://localhost:3000',
    },
    setupFiles: ['./tests/setup.ts'],
    // Each test file gets its own in-memory MongoDB; the first run downloads the mongod binary.
    hookTimeout: 120_000,
    testTimeout: 20_000,
  },
});
