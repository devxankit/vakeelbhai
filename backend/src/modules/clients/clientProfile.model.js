import mongoose from 'mongoose'

/** Client details beyond the login (SOW 5.1: name, mobile, email, city/state). Name and email live on User. */
const clientProfileSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    city: { type: String, trim: true, maxlength: 60, default: '' },
    state: { type: String, trim: true, maxlength: 60, default: '' },
    /** Refer and earn (SCOPE-OF-WORK 7): this client's code, and who referred them. */
    referralCode: { type: String, trim: true, uppercase: true },
    referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    referredAt: Date,
  },
  { timestamps: true },
)

clientProfileSchema.index({ referralCode: 1 }, { unique: true, partialFilterExpression: { referralCode: { $type: 'string' } } })
clientProfileSchema.index({ referredBy: 1 })

export const ClientProfile = mongoose.model('ClientProfile', clientProfileSchema)
