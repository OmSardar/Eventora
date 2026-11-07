import mongoose from 'mongoose';
import { logger } from '../logging/logger.js';

let isConnected = false;

export async function connectDatabase(uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora') {
  if (isConnected) {
    return mongoose.connection;
  }

  try {
    mongoose.set('strictQuery', true);

    const conn = await mongoose.connect(uri, {
      maxPoolSize: 20,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      autoIndex: process.env.NODE_ENV !== 'production'
    });

    isConnected = true;
    logger.info({ host: conn.connection.host, name: conn.connection.name }, 'Connected to MongoDB database');

    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      isConnected = false;
      logger.warn('MongoDB disconnected');
    });

    return conn.connection;
  } catch (error) {
    logger.fatal({ error: error.message }, 'Failed to connect to MongoDB');
    throw error;
  }
}

export async function disconnectDatabase() {
  if (!isConnected) return;
  try {
    await mongoose.disconnect();
    isConnected = false;
    logger.info('Disconnected from MongoDB');
  } catch (error) {
    logger.error({ error: error.message }, 'Error disconnecting from MongoDB');
  }
}
