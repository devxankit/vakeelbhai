import multer from 'multer'
import { fileTypeFromBuffer } from 'file-type'
import { env } from '../config/env.js'
import { AppError, badRequest } from '../utils/errors.js'

/**
 * One image per request, kept in memory (it is encrypted before it is written).
 * The type is checked from the file's own bytes, not from its name or the browser's
 * claimed type, so a renamed .exe or .html is refused.
 */
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export function singleImage(field = 'file') {
  const mw = multer({ storage: multer.memoryStorage(), limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 } }).single(field)
  return (req, res, next) =>
    mw(req, res, async (err) => {
      if (err) {
        if (err.code === 'LIMIT_FILE_SIZE') return next(new AppError(413, 'FILE_TOO_LARGE', 'The image must be ' + env.MAX_UPLOAD_MB + ' MB or smaller'))
        return next(badRequest('Upload failed: ' + err.message))
      }
      if (!req.file) return next(badRequest('Attach an image in the "' + field + '" field'))
      const type = await fileTypeFromBuffer(req.file.buffer)
      if (!type || !IMAGE_TYPES.includes(type.mime)) return next(new AppError(415, 'UNSUPPORTED_FILE', 'Upload a JPG, PNG or WebP photo'))
      req.file.mime = type.mime
      next()
    })
}
