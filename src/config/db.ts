import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDatabase(uri: string = env.MONGODB_URI, dbName: string = env.MONGODB_DB_NAME) {
  await mongoose.connect(uri, { dbName, serverSelectionTimeoutMS: 10_000 });
  logger.info({ dbName }, 'MongoDB connected');
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}
