import mongoose from 'mongoose'

/**
 * One logged-in device. The refresh token is stored only as a hash and rotates on every
 * refresh. If an already-used refresh token comes back, someone copied it, so the whole
 * session is revoked. Logging out revokes only this device (SCOPE-OF-WORK section 2).
 */
const sessionSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['user', 'admin'], required: true },
    subject: { type: mongoose.Schema.Types.ObjectId, required: true, refPath: 'subjectModel' },
    subjectModel: { type: String, enum: ['User', 'AdminUser'], required: true },
    role: { type: String, required: true },
    refreshHash: { type: String, required: true },
    previousHash: String,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedReason: String,
    userAgent: { type: String, maxlength: 300 },
    ip: String,
    lastUsedAt: Date,
  },
  { timestamps: true },
)

sessionSchema.index({ subject: 1, revokedAt: 1 })
// Expired sessions are removed by MongoDB a day after they expire.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 })

export const Session = mongoose.model('Session', sessionSchema)
