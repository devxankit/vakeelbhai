import mongoose from 'mongoose'

/**
 * One checkout: a service fee for a request, a membership plan, or e-Challans. Everything is
 * calculated on the server (pricing.js) and stored here, so history never changes when
 * the admin edits rates later. A payment becomes `paid` ONLY after the server verified
 * the gateway signature and checked the payment with the gateway (or the webhook said so),
 * never because the browser reported success.
 *
 * status: created → paid | failed | expired | cancelled ; paid → refunded
 */
const paymentSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    purpose: { type: String, enum: ['service', 'membership', 'challan', 'gst'], required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'ServiceRequest' },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan' },
    challanOrder: { type: mongoose.Schema.Types.ObjectId, ref: 'ChallanOrder' },
    gstFiling: { type: mongoose.Schema.Types.ObjectId, ref: 'GstFiling' },
    /** The offer applied at checkout (Phase 4b). */
    offer: {
      type: new mongoose.Schema({ id: mongoose.Schema.Types.ObjectId, title: String, code: String, kind: String, cashbackPaise: Number }, { _id: false }),
      default: undefined,
    },
    /** GST invoice number, given when the payment is confirmed: VB/2026-27/00001 */
    invoiceNo: { type: String, default: undefined },
    planName: String,
    planMonths: Number,
    amounts: {
      feePaise: { type: Number, required: true },
      discountPaise: { type: Number, default: 0 },
      basePaise: { type: Number, required: true },
      gstPaise: { type: Number, default: 0 },
      walletPaise: { type: Number, default: 0 },
      /** Charged through the gateway. */
      totalPaise: { type: Number, required: true },
    },
    rates: { commissionBp: Number, gstBp: Number },
    /** Service payments: what the advocate will get, fixed at payment time. */
    payout: { commissionPaise: Number, gstOnCommissionPaise: Number, netPaise: Number },
    provider: { type: String, required: true },
    orderId: { type: String },
    gatewayPaymentId: { type: String },
    method: String,
    status: { type: String, enum: ['created', 'paid', 'failed', 'expired', 'cancelled', 'refunded'], default: 'created' },
    expiresAt: Date,
    paidAt: Date,
    failureReason: String,
    /** Paid, but the request could no longer take it (e.g. changed meanwhile). Needs an admin refund. */
    needsAttention: { type: String, default: null },
    refund: {
      status: { type: String, enum: ['pending', 'processed', 'failed'] },
      gatewayPaise: Number,
      walletPaise: Number,
      gatewayRefundId: String,
      reason: String,
      by: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
      at: Date,
      error: String,
    },
  },
  { timestamps: true },
)

paymentSchema.index({ orderId: 1 }, { unique: true, partialFilterExpression: { orderId: { $type: 'string' } } })
paymentSchema.index({ gatewayPaymentId: 1 }, { unique: true, partialFilterExpression: { gatewayPaymentId: { $type: 'string' } } })
paymentSchema.index({ request: 1, status: 1 })
paymentSchema.index({ status: 1, expiresAt: 1 })
paymentSchema.index({ user: 1, createdAt: -1 })
paymentSchema.index({ invoiceNo: 1 }, { unique: true, partialFilterExpression: { invoiceNo: { $type: 'string' } } })
paymentSchema.index({ status: 1, paidAt: 1 })

export const Payment = mongoose.model('Payment', paymentSchema)

/** Gateway webhook ids already handled (duplicates are ignored). */
const webhookEventSchema = new mongoose.Schema({ _id: String, provider: String, kind: String, orderId: String }, { timestamps: { createdAt: true, updatedAt: false } })
export const WebhookEvent = mongoose.model('WebhookEvent', webhookEventSchema)

/**
 * Advocate withdrawal (SCOPE-OF-WORK 6.1): the amount leaves the balance when requested;
 * the admin approves and marks it paid (with the bank reference), or rejects it (money back).
 */
const withdrawalSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amountPaise: { type: Number, required: true, min: 1 },
    to: { type: String, required: true },
    status: { type: String, enum: ['requested', 'approved', 'paid', 'rejected'], default: 'requested' },
    utr: String,
    reason: String,
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    decidedAt: Date,
  },
  { timestamps: true },
)
withdrawalSchema.index({ status: 1, createdAt: 1 })
withdrawalSchema.index({ user: 1, createdAt: -1 })
export const Withdrawal = mongoose.model('Withdrawal', withdrawalSchema)

/** Where withdrawals go. The account number is stored encrypted; only the last 4 digits are shown. */
const payoutAccountSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    holder: { type: String, trim: true, maxlength: 80, default: '' },
    accountEnc: String,
    accountLast4: String,
    ifsc: { type: String, trim: true, uppercase: true, default: '' },
    upi: { type: String, trim: true, lowercase: true, default: '' },
  },
  { timestamps: true },
)
export const PayoutAccount = mongoose.model('PayoutAccount', payoutAccountSchema)
