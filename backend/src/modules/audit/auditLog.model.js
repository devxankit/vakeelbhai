import mongoose from 'mongoose'

/** Append-only record of admin actions (SCOPE-OF-WORK section 15). Never updated or deleted by the API. */
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    actorEmail: String,
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: String,
    before: mongoose.Schema.Types.Mixed,
    after: mongoose.Schema.Types.Mixed,
    note: { type: String, maxlength: 500 },
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
)

auditLogSchema.index({ createdAt: -1 })
auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 })
auditLogSchema.index({ actor: 1, createdAt: -1 })

export const AuditLog = mongoose.model('AuditLog', auditLogSchema)
