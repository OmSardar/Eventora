import { v2 as cloudinary } from 'cloudinary';
import { logger } from '../logging/logger.js';
import { BadRequestError } from '../../shared/errors/AppError.js';

// Initialize Cloudinary with environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'eventora-demo-cloud',
  api_key: process.env.CLOUDINARY_API_KEY || '111111111111111',
  api_secret: process.env.CLOUDINARY_API_SECRET || 'eventora-mock-secret-for-testing-purposes-only',
  secure: true
});

const ALLOWED_FOLDER = 'eventora/events';
const ALLOWED_FORMATS = ['jpg', 'jpeg', 'png', 'webp'];
const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * Generate cryptographically signed parameters for direct browser-to-Cloudinary upload.
 * Strictly enforces destination folder and never exposes API secret to client.
 */
export function generateUploadSignature({ organizerId, timestamp = Math.round(Date.now() / 1000) }) {
  if (!organizerId) {
    throw new BadRequestError('Organizer ID is required for signature generation');
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'eventora-demo-cloud';
  const apiKey = process.env.CLOUDINARY_API_KEY || '111111111111111';
  const apiSecret = process.env.CLOUDINARY_API_SECRET || 'eventora-mock-secret-for-testing-purposes-only';

  const paramsToSign = {
    folder: ALLOWED_FOLDER,
    timestamp: Number(timestamp)
  };

  const signature = cloudinary.utils.api_sign_request(paramsToSign, apiSecret);

  return {
    signature,
    timestamp: paramsToSign.timestamp,
    apiKey,
    cloudName,
    folder: ALLOWED_FOLDER,
    maxFileSize: MAX_FILE_SIZE_BYTES,
    allowedFormats: ALLOWED_FORMATS
  };
}

/**
 * Safely delete an asset from Cloudinary when an event image is replaced.
 */
export async function deleteCloudinaryAsset(publicId) {
  if (!publicId || typeof publicId !== 'string') return;

  // Security check: only allow destroying assets within the designated eventora folder
  if (!publicId.startsWith('eventora/')) {
    logger.warn({ publicId }, 'Blocked attempt to delete Cloudinary asset outside eventora namespace');
    return;
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info({ publicId, result }, 'Cloudinary asset deleted successfully');
    return result;
  } catch (err) {
    logger.error({ publicId, err: err.message }, 'Failed to delete Cloudinary asset (non-fatal)');
  }
}

export { cloudinary };

