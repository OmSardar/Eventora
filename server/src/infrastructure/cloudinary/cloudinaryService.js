import { v2 as cloudinary } from 'cloudinary';
import crypto from 'node:crypto';
import { logger } from '../logging/logger.js';
import { AppError } from '../../shared/errors/AppError.js';

// Initialize Cloudinary SDK
const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'eventora-demo-cloud';
const apiKey = process.env.CLOUDINARY_API_KEY || '111111111111111';
const apiSecret = process.env.CLOUDINARY_API_SECRET || 'eventora-mock-secret-for-testing-purposes-only';

cloudinary.config({
  cloud_name: cloudName,
  api_key: apiKey,
  api_secret: apiSecret,
  secure: true
});

const ALLOWED_FOLDER = 'eventora/events';

// Testing hooks for mocking Cloudinary operations
let mockUploader = null;
let mockDestroyer = null;

export function setCloudinaryUploaderMock(mockFn) {
  mockUploader = mockFn;
}

export function setCloudinaryDestroyerMock(mockFn) {
  mockDestroyer = mockFn;
}

/**
 * Validates that Cloudinary environment variables are configured.
 * Never logs or exposes credentials.
 */
export function validateCloudinaryConfig() {
  const isMock =
    !process.env.CLOUDINARY_API_KEY ||
    process.env.CLOUDINARY_API_KEY.includes('11111111') ||
    process.env.NODE_ENV === 'test';

  return {
    configured: Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY),
    isMock,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || 'eventora-demo-cloud'
  };
}

/**
 * Uploads an image buffer directly to Cloudinary using the server-side SDK.
 * Server strictly controls folder destination, unique public IDs, and transformations.
 *
 * @param {Object} params
 * @param {Buffer} params.buffer - Raw image bytes
 * @param {string} [params.folder] - Target Cloudinary folder (default: 'eventora/events')
 * @param {string} [params.eventId] - Event identifier for public ID naming
 * @param {string} [params.format] - File format ('jpg', 'png', 'webp')
 * @returns {Promise<{ secure_url: string, public_id: string, format: string, width: number, height: number, bytes: number }>}
 */
export async function uploadImageToCloudinary({ buffer, folder = ALLOWED_FOLDER, eventId = 'new', format = 'jpg' }) {
  // If custom test mock is injected, delegate to it
  if (mockUploader) {
    return mockUploader({ buffer, folder, eventId, format });
  }

  const { isMock, cloudName: activeCloud } = validateCloudinaryConfig();

  // Generate server-controlled, cryptographically random public ID
  const uniqueSuffix = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const publicId = `${folder}/banner_${eventId}_${uniqueSuffix}`;

  // If running in test or local dev without live Cloudinary credentials, return simulated response
  if (isMock) {
    logger.info(
      { publicId, format, bytes: buffer.length },
      'Cloudinary [MOCK/DEV MODE]: Banner upload simulated successfully'
    );
    return {
      secure_url: `https://res.cloudinary.com/${activeCloud}/image/upload/v${Math.floor(Date.now() / 1000)}/${publicId}.${format}`,
      public_id: publicId,
      format,
      width: 1200,
      height: 630,
      bytes: buffer.length
    };
  }

  // Real upload via official Cloudinary upload_stream
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder,
        public_id: publicId,
        resource_type: 'image',
        overwrite: false,
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          logger.error({ err: error.message }, 'Cloudinary server-side upload stream failed');
          return reject(new AppError('Failed to upload image to Cloudinary storage', 502));
        }

        logger.info({ publicId: result.public_id, format: result.format }, 'Cloudinary asset uploaded successfully');
        resolve({
          secure_url: result.secure_url,
          public_id: result.public_id,
          format: result.format,
          width: result.width,
          height: result.height,
          bytes: result.bytes
        });
      }
    );

    uploadStream.end(buffer);
  });
}

/**
 * Safely deletes a Cloudinary asset when an event banner is replaced or removed.
 * Enforces namespace security to prevent accidental deletion outside 'eventora/'.
 *
 * @param {string} publicId - Cloudinary public ID to destroy
 * @returns {Promise<Object|void>}
 */
export async function deleteCloudinaryAsset(publicId) {
  if (!publicId || typeof publicId !== 'string') return;

  // Security barrier: only allow destroying assets within the designated eventora namespace
  if (!publicId.startsWith('eventora/')) {
    logger.warn({ publicId }, 'Blocked attempt to delete Cloudinary asset outside eventora namespace');
    return;
  }

  if (mockDestroyer) {
    return mockDestroyer(publicId);
  }

  const { isMock } = validateCloudinaryConfig();
  if (isMock) {
    logger.info({ publicId }, 'Cloudinary [MOCK/DEV MODE]: Asset deletion simulated successfully');
    return { result: 'ok' };
  }

  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info({ publicId, result }, 'Cloudinary asset deleted successfully');
    return result;
  } catch (err) {
    logger.error({ publicId, err: err?.message }, 'Failed to delete Cloudinary asset (non-fatal cleanup)');
  }
}

export { cloudinary };
