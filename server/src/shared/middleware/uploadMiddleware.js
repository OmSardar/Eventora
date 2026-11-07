import multer from 'multer';
import { BadRequestError } from '../errors/AppError.js';

// Enforce strictly memory storage (no permanent or unmanaged disk files)
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  }
});

/**
 * Express middleware to safely parse multipart/form-data for event banner uploads.
 * Accepts single file under field names 'banner', 'image', or 'file'.
 * Enforces size limits and rejects multi-file uploads.
 */
export function handleBannerUpload(req, res, next) {
  upload.any()(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new BadRequestError('File size exceeds the 5MB maximum upload limit'));
      }
      if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new BadRequestError('Only a single image file can be uploaded'));
      }
      return next(new BadRequestError(err.message || 'Multipart file parsing failed'));
    }

    if (!req.files || req.files.length === 0) {
      return next(new BadRequestError('Image file is required'));
    }

    if (req.files.length > 1) {
      return next(new BadRequestError('Only a single image file can be uploaded'));
    }

    // Attach the single verified file to req.file
    req.file = req.files[0];
    next();
  });
}

