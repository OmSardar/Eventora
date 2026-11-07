import dotenv from 'dotenv';
dotenv.config();

import app from './app.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/connection.js';
import { logger } from './infrastructure/logging/logger.js';

const PORT = parseInt(process.env.PORT, 10) || 5000;

async function bootstrap() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/eventora';
    await connectDatabase(mongoUri);

    const server = app.listen(PORT, () => {
      logger.info(`Eventora Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
      logger.info(`Health check available at http://localhost:${PORT}/api/v1/health`);
    });

    // Graceful shutdown handling
    const shutdown = async (signal) => {
      logger.info(`Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        await disconnectDatabase();
        process.exit(0);
      });

      // Force shutdown after timeout if pending connections hang
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (error) {
    logger.fatal({ err: error }, 'Failed to bootstrap server');
    process.exit(1);
  }
}

bootstrap();
