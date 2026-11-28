import mongoose from 'mongoose'
import { nextSeq } from '../common/counter.model.js'

/**
 * An advocate's membership period (SOW 4.4, SCOPE-OF-WORK 3.4). One document per paid or
 * granted period; renewing adds a new period starting at the current end date.
 *   source 'payment':     created by the payments module (Phase 4) after a verified payment
 *   source 'admin_grant': "membership control (grant or extend)" in the admin panel, with a reason
 * An advocate is "active" while any non-revoked period covers now.
 */
const membershipSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: mongoose.Schema.Types.ObjectId, ref: 'MembershipPlan' },
    planName: { type: String, required: true },
    memberId: { type: String, required: true },
    startAt: { type: Date, required: true },
    endAt: { type: Date, required: true },
    source: { type: String, enum: ['payment', 'admin_grant'], required: true },
    grantedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser' },
    reason: { type: String, maxlength: 300 },
    revokedAt: Date,
  },
  { timestamps: true },
)

membershipSchema.index({ user: 1, endAt: -1 })

export const Membership = mongoose.model('Membership', membershipSchema)

/** The membership covering now, or null. */
export const activeMembership = (userId, session) => Membership.findOne({ user: userId, revokedAt: null, startAt: { $lte: new Date() }, endAt: { $gt: new Date() } }).sort({ endAt: -1 }).session(session ?? null)

/** Current or latest period (for showing the card and renewing). */
export const latestMembership = (userId) => Membership.findOne({ user: userId, revokedAt: null }).sort({ endAt: -1 })

/** The advocate's permanent member ID, created the first time they get a membership. */
export async function memberIdFor(userId, session) {
  const prev = await Membership.findOne({ user: userId }).select('memberId').session(session ?? null).lean()
  if (prev) return prev.memberId
  return 'VB-AD-' + String(await nextSeq('memberId', 0, session)).padStart(5, '0')
}

export function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}
