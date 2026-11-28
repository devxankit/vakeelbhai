import mongoose from 'mongoose'

/**
 * Advocate membership plans, created by the admin (SOW 4.4, SCOPE-OF-WORK 3.4).
 * No plans or prices are built in: the client has not given them yet. A plan without a
 * price is shown as "[PRICE]" and cannot be bought. Buying (payment + GST invoice +
 * activation) arrives with the payments module.
 */
const planSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 40 },
    durationMonths: { type: Number, required: true, min: 1, max: 60 },
    /** Price before GST, in paise. null = not decided yet. */
    pricePaise: { type: Number, default: null, min: 0 },
    benefits: { type: [{ type: String, trim: true, maxlength: 120 }], default: [] },
    note: { type: String, trim: true, maxlength: 80, default: '' },
    highlight: { type: Boolean, default: false },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
  },
  { timestamps: true },
)

planSchema.index({ active: 1, order: 1 })

export const MembershipPlan = mongoose.model('MembershipPlan', planSchema)
