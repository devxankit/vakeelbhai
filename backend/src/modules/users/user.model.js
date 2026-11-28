import mongoose from 'mongoose'

/**
 * A client or advocate login. One account per (phone, role): the same number can hold a
 * client account and an advocate account, each with its own wallet and history.
 * (Pending business decision #10 in backend/README.md; change here if the client decides otherwise.)
 *
 * Role-specific details live in ClientProfile / AdvocateProfile (Phase 3).
 */
const userSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, match: /^[6-9]\d{9}$/ },
    role: { type: String, required: true, enum: ['client', 'advocate'] },
    status: { type: String, enum: ['active', 'blocked', 'deleted'], default: 'active', index: true },
    name: { type: String, trim: true, maxlength: 80, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 120, default: '' },
    blockedReason: { type: String, maxlength: 300 },
    lastLoginAt: Date,
  },
  { timestamps: true },
)

userSchema.index({ phone: 1, role: 1 }, { unique: true })
userSchema.index({ role: 1, createdAt: -1 })

userSchema.methods.toPublic = function () {
  return { id: this.id, phone: this.phone, role: this.role, status: this.status, name: this.name, email: this.email, createdAt: this.createdAt }
}

export const User = mongoose.model('User', userSchema)
