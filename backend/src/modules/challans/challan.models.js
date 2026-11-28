import mongoose from 'mongoose'

/**
 * e-Challan (SCOPE-OF-WORK 9).
 *
 * The client saves a vehicle (type + number plate), sees its challans from the e-Challan
 * provider, and pays the challans plus Vakeel Bhai's charge (and GST on the charge) to
 * Vakeel Bhai. Our team then pays the department within settings.challanPayHours (24 by
 * default) and records the department's receipt number. If it cannot be paid, the admin
 * refunds the client in full.
 */

export const VEHICLE_TYPES = ['bike', 'car', 'auto', 'commercial', 'other']

/** "MP 09-ab 1234" → "MP09AB1234". */
export const normalisePlate = (n) => String(n ?? '').replace(/[\s.-]/g, '').toUpperCase()
/** Indian number plates, including the BH series (22BH1234AA). */
export const PLATE_RE = /^([A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}|\d{2}BH\d{4}[A-Z]{1,2})$/
/** "MP09AB1234" → "MP 09 AB 1234" for display. */
export function prettyPlate(p) {
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/.exec(p)
  if (m) return [m[1], m[2].padStart(2, '0'), m[3], m[4]].filter(Boolean).join(' ')
  const bh = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/.exec(p)
  return bh ? bh.slice(1).join(' ') : p
}

const vehicleSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plate: { type: String, required: true, match: PLATE_RE },
    type: { type: String, enum: VEHICLE_TYPES, required: true },
    removedAt: { type: Date, default: null },
  },
  { timestamps: true },
)
vehicleSchema.index({ user: 1, plate: 1 }, { unique: true })
export const Vehicle = mongoose.model('Vehicle', vehicleSchema)

/**
 * status:
 *   awaiting_payment  checkout started, not paid yet
 *   processing        paid to Vakeel Bhai; our team pays the department before dueBy
 *   completed         paid to the department; departmentRef is the receipt number
 *   refunded          could not be paid; the client got the full amount back
 *   cancelled         checkout not completed (closed, failed or expired)
 */
export const CHALLAN_ORDER_STATUS = ['awaiting_payment', 'processing', 'completed', 'refunded', 'cancelled']
/** Orders that hold their challans: the same challan cannot be in two of these. */
export const CHALLAN_HELD = ['awaiting_payment', 'processing', 'completed']

const itemSchema = new mongoose.Schema(
  { challanNo: { type: String, required: true }, offence: String, amountPaise: { type: Number, required: true }, date: String, place: String, court: Boolean },
  { _id: false },
)

const challanOrderSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vehicle: { plate: { type: String, required: true }, type: { type: String, required: true } },
    items: { type: [itemSchema], validate: (v) => v.length > 0 },
    amounts: {
      challanPaise: { type: Number, required: true },
      feePaise: { type: Number, required: true },
      gstPaise: { type: Number, required: true },
      totalPaise: { type: Number, required: true },
    },
    rates: { feePerChallanPaise: Number, gstBp: Number, payHours: Number },
    payment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment', default: null },
    status: { type: String, enum: CHALLAN_ORDER_STATUS, default: 'awaiting_payment' },
    paidAt: Date,
    /** Our promise to the client: paid to the department by this time. */
    dueBy: Date,
    completedAt: Date,
    /** The department's receipt / transaction number, entered by the admin. */
    departmentRef: String,
    handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    note: String,
  },
  { timestamps: true },
)
challanOrderSchema.index({ user: 1, createdAt: -1 })
challanOrderSchema.index({ status: 1, dueBy: 1 })
challanOrderSchema.index({ 'items.challanNo': 1, status: 1 })
export const ChallanOrder = mongoose.model('ChallanOrder', challanOrderSchema)

/**
 * One row per challan that is in an open, paid or completed order (_id = challan number).
 * The unique _id makes it impossible to pay the same challan twice, even when two checkouts
 * start at the same moment. Removed when the order is cancelled or refunded.
 */
const challanLockSchema = new mongoose.Schema({ _id: String, order: { type: mongoose.Schema.Types.ObjectId, ref: 'ChallanOrder', required: true } }, { timestamps: { createdAt: true, updatedAt: false } })
export const ChallanLock = mongoose.model('ChallanLock', challanLockSchema)
