import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

let mongod: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'doctor_tracker_test' });
  // Build indexes up front so unique constraints are enforced in tests.
  await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()));
});

afterEach(async () => {
  const collections = (await mongoose.connection.db?.collections()) ?? [];
  await Promise.all(collections.map((c) => c.deleteMany({})));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod?.stop();
});
