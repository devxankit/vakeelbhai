import mongoose from 'mongoose'

/**
 * The current OTP for a phone and role. Only an HMAC of the code is stored.
 * `sends` keeps the send times of the last hour for the per-phone limit.
 */
const otpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true },
    role: { type: String, required: true, enum: ['client', 'advocate'] },
    codeHash: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
    sends: [Date],
    lastSentAt: Date,
    // Removes the document once nothing has happened for a day.
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true },
)

otpSchema.index({ phone: 1, role: 1 }, { unique: true })
otpSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 })

export const Otp = mongoose.model('Otp', otpSchema)
