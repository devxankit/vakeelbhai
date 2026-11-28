import mongoose from 'mongoose'

/**
 * Offers (SCOPE-OF-WORK 8): created by the admin.
 *   kind      discount (taken off the fee at checkout) | cashback (credited to the client's
 *             wallet when the service is completed)
 *   value     percent (basis points) or flat (paise), capped by maxPaise
 *   scope     service (client fees) | membership (advocate plans)
 *   code      coupon code the user types, or autoApply (best automatic offer is applied)
 * Earnings and GST are calculated on the discounted amount (the pricing engine does this).
 */
const offerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 80 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    code: { type: String, trim: true, uppercase: true, match: /^[A-Z0-9]{3,20}$/ },
    autoApply: { type: Boolean, default: false },
    kind: { type: String, enum: ['discount', 'cashback'], default: 'discount' },
    valueType: { type: String, enum: ['percent', 'flat'], required: true },
    /** Basis points for percent, paise for flat. */
    value: { type: Number, required: true, min: 1 },
    maxPaise: { type: Number, default: null, min: 1 },
    minOrderPaise: { type: Number, default: 0, min: 0 },
    scope: { type: String, enum: ['service', 'membership'], default: 'service' },
    /** Category keys (service offers). Empty = every category. */
    categories: { type: [String], default: [] },
    /** Only on the client's first paid service. */
    firstServiceOnly: { type: Boolean, default: false },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    /** Total uses across everyone (null = unlimited) and per user. */
    usageLimit: { type: Number, default: null, min: 1 },
    perUserLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
)
offerSchema.index({ code: 1 }, { unique: true, partialFilterExpression: { code: { $type: 'string' } } })
offerSchema.index({ active: 1, scope: 1, startAt: 1, endAt: 1 })
export const Offer = mongoose.model('Offer', offerSchema)

/**
 * One use of an offer by a payment.
 *   reserved  checkout started (counts towards the limits)
 *   used      paid
 *   credited  cashback paid into the wallet
 *   released  checkout not completed, or refunded: the use is given back
 */
const redemptionSchema = new mongoose.Schema(
  {
    offer: { type: mongoose.Schema.Types.ObjectId, ref: 'Offer', required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', required: true, unique: true },
    discountPaise: { type: Number, default: 0 },
    cashbackPaise: { type: Number, default: 0 },
    status: { type: String, enum: ['reserved', 'used', 'credited', 'released'], default: 'reserved' },
  },
  { timestamps: true },
)
redemptionSchema.index({ offer: 1, user: 1, status: 1 })
export const OfferRedemption = mongoose.model('OfferRedemption', redemptionSchema)

/** Home-screen banners (SCOPE-OF-WORK 8: shown while an offer is live). */
const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 70 },
    sub: { type: String, trim: true, maxlength: 100, default: '' },
    tag: { type: String, trim: true, maxlength: 20, default: '' },
    image: { type: new mongoose.Schema({ path: String, mime: String, size: Number, sha256: String, uploadedAt: Date }, { _id: false }), default: null },
    /** Where a tap goes: offers · challan · categories · category (value = key) · none */
    link: { kind: { type: String, enum: ['offers', 'challan', 'categories', 'category', 'gst', 'none'], default: 'none' }, value: { type: String, default: '' } },
    audience: { type: String, enum: ['client', 'advocate', 'all'], default: 'client' },
    startAt: { type: Date, default: null },
    endAt: { type: Date, default: null },
    active: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
)
export const Banner = mongoose.model('Banner', bannerSchema)
