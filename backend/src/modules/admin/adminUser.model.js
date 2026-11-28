import mongoose from 'mongoose'

/** Admin panel staff. Email + password (bcrypt), with lock-out after repeated failures. */
export const ADMIN_ROLES = ['super_admin', 'staff']

const adminUserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: 'staff' },
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    failedLogins: { type: Number, default: 0, select: false },
    lockUntil: { type: Date, select: false },
    lastLoginAt: Date,
    passwordChangedAt: Date,
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true },
)

adminUserSchema.methods.toPublic = function () {
  return { id: this.id, name: this.name, email: this.email, role: this.role, status: this.status, lastLoginAt: this.lastLoginAt, createdAt: this.createdAt }
}

export const AdminUser = mongoose.model('AdminUser', adminUserSchema)
