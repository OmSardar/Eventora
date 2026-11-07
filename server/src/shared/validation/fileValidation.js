import { BadRequestError } from '../errors/AppError.js';

export const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const MAX_IMAGE_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Validates actual file bytes against known cryptographic magic bytes.
 * Strictly permits only JPEG, PNG, and WebP.
 * Rejects SVGs, HTML, XML, executables, scripts, and malformed files.
 *
 * @param {Buffer} buffer - Raw file bytes
 * @param {string} declaredMimeType - Client declared MIME type
 * @returns {{ ext: string, mime: string, format: string }}
 */
export function validateImageBuffer(buffer, declaredMimeType = '') {
  if (!buffer || !Buffer.isBuffer(buffer)) {
    throw new BadRequestError('Invalid or missing file buffer');
  }

  if (buffer.length === 0) {
    throw new BadRequestError('Uploaded image file cannot be empty');
  }

  if (buffer.length > MAX_IMAGE_FILE_SIZE) {
    throw new BadRequestError('File size exceeds the 5MB maximum upload limit');
  }

  // Minimum header size to detect magic bytes
  if (buffer.length < 12) {
    throw new BadRequestError('Malformed or corrupted image file');
  }

  // Reject text/script/markup payloads (e.g. SVG or HTML masquerading as image)
  const headerUtf8 = buffer.subarray(0, 200).toString('utf8').toLowerCase();
  if (
    headerUtf8.includes('<svg') ||
    headerUtf8.includes('<?xml') ||
    headerUtf8.includes('<!doctype') ||
    headerUtf8.includes('<html') ||
    headerUtf8.includes('<script')
  ) {
    throw new BadRequestError('SVG and XML/HTML formats are not permitted for security reasons');
  }

  // Reject Windows PE executable ('MZ') or Linux ELF ('\x7fELF')
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    throw new BadRequestError('Executable binary formats are strictly prohibited');
  }
  if (buffer[0] === 0x7F && buffer[1] === 0x45 && buffer[2] === 0x4C && buffer[3] === 0x46) {
    throw new BadRequestError('Executable binary formats are strictly prohibited');
  }

  let detected = null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    detected = { ext: 'jpg', mime: 'image/jpeg', format: 'jpg' };
  }
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  else if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4E &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0D &&
    buffer[5] === 0x0A &&
    buffer[6] === 0x1A &&
    buffer[7] === 0x0A
  ) {
    detected = { ext: 'png', mime: 'image/png', format: 'png' };
  }
  // WebP: RIFF (bytes 0-3) and WEBP (bytes 8-11)
  else if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    detected = { ext: 'webp', mime: 'image/webp', format: 'webp' };
  }

  if (!detected) {
    throw new BadRequestError(
      'Unsupported image format or invalid file signature. Only JPEG, PNG, and WebP are allowed'
    );
  }

  // Spoofed MIME check: if declared MIME type is provided but conflicts with detected magic bytes
  if (declaredMimeType) {
    const normalizedDeclared = declaredMimeType.toLowerCase().trim();
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(normalizedDeclared)) {
      throw new BadRequestError('Declared MIME type is not allowed');
    }
    // If declared as image/png but magic bytes are jpg, or vice versa
    if (normalizedDeclared !== detected.mime) {
      throw new BadRequestError('File signature does not match declared MIME type (spoofed format detected)');
    }
  }

  return detected;
}

