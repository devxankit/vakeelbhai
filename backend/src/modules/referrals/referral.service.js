import crypto from 'node:crypto'
import { applyBp, toRupees } from '../../utils/money.js'
import { getSettings } from '../settings/settings.service.js'
import { post } from '../wallet/wallet.service.js'
import { WalletTransaction } from '../wallet/wallet.models.js'
import { ClientProfile } from '../clients/clientProfile.model.js'
import { User } from '../users/user.model.js'
import { Payment } from '../payments/payment.models.js'

/**
 * Refer and earn (SCOPE-OF-WORK 7, clients only). The referrer earns when the referred client
 * completes their FIRST paid service. Reward type and value, monthly cap and on/off are admin
 * settings; nothing is paid while referrals are switched off.
 */

/** The client's code, created the first time it is asked for: VB + 5 letters of the name + 3 digits. */
export async function ensureCode(userId) {
  const p = await ClientProfile.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true, new: true })
  if (p.referralCode) return p.referralCode
  const u = await User.findById(userId).select('name').lean()
  const stem = ((u?.name || 'USER').replace(/[^A-Za-z]/g, '').toUpperCase() + 'XXXXX').slice(0, 5)
  for (let i = 0; i < 8; i++) {
    const code = 'VB' + stem + String(crypto.randomInt(100, 1000))
    try {
      const upd = await ClientProfile.findOneAndUpdate({ _id: p._id, referralCode: { $exists: false } }, { $set: { referralCode: code } }, { new: true })
      return upd?.referralCode ?? (await ClientProfile.findById(p._id)).referralCode
    } catch (e) {
      if (e?.code !== 11000) throw e
    }
  }
  throw new Error('Could not create a referral code')
}

/** Reward for a first service with this base (paise), from settings; 0 when off. */
function rewardFor(settings, basePaise) {
  const r = settings.referral
  if (!r?.enabled || !r.rewardType || r.rewardValue == null) return 0
  return r.rewardType === 'flat' ? r.rewardValue : applyBp(basePaise, r.rewardValue)
}

/**
 * Called inside the completion transaction. Pays the referrer once, if this is the client's
 * first completed paid service, within the referrer's monthly cap. Returns { referrer, amountPaise } or null.
 */
export async function rewardReferral(session, clientId, payment) {
  const settings = await getSettings()
  let amount = rewardFor(settings, payment.amounts.basePaise)
  if (amount <= 0) return null
  const profile = await ClientProfile.findOne({ user: clientId }).session(session).lean()
  if (!profile?.referredBy) return null
  const earlier = await Payment.countDocuments({ user: clientId, purpose: 'service', status: 'paid', _id: { $ne: payment._id }, paidAt: { $lt: payment.paidAt } }).session(session)
  if (earlier > 0) return null
  const referrer = await User.findOne({ _id: profile.referredBy, status: 'active' }).session(session).lean()
  if (!referrer) return null
  const cap = settings.referral.monthlyCapPaise
  if (cap != null) {
    const since = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    const got = await WalletTransaction.aggregate([{ $match: { user: referrer._id, type: 'referral', createdAt: { $gte: since } } }, { $group: { _id: null, s: { $sum: '$amountPaise' } } }]).session(session)
    amount = Math.min(amount, Math.max(0, cap - (got[0]?.s ?? 0)))
    if (amount <= 0) return null
  }
  const friend = await User.findById(clientId).select('name').session(session).lean()
  const first = String(friend?.name || 'Your friend').split(/\s+/)[0]
  const tx = await post(session, { userId: referrer._id, role: 'client', type: 'referral', amount, title: 'Referral reward', sub: first + ' completed a first paid service', ref: { kind: 'referral', id: String(clientId) }, status: 'Credited', key: 'referral:' + String(clientId) })
  return tx.amountPaise === amount ? { referrer: referrer._id, amountPaise: amount } : null
}

/** What the client sees on the Refer and earn screen. */
export async function referralView(userId) {
  const [code, settings, me] = await Promise.all([ensureCode(userId), getSettings(), ClientProfile.findOne({ user: userId }).lean()])
  const r = settings.referral ?? {}
  const friends = await ClientProfile.find({ referredBy: userId }).sort({ referredAt: -1 }).limit(100).lean()
  const users = new Map((await User.find({ _id: { $in: friends.map((f) => f.user) } }).select('name').lean()).map((u) => [String(u._id), u]))
  const rewards = new Map((await WalletTransaction.find({ user: userId, type: 'referral' }).lean()).map((t) => [t.ref?.id, t]))
  const hasPaid = await Payment.exists({ user: userId, purpose: 'service', status: { $in: ['paid', 'refunded'] } })
  return {
    code,
    enabled: !!r.enabled,
    rewardType: r.rewardType ?? null,
    reward: r.rewardValue == null ? null : r.rewardType === 'flat' ? toRupees(r.rewardValue) : r.rewardValue / 100,
    monthlyCap: r.monthlyCapPaise == null ? null : toRupees(r.monthlyCapPaise),
    referredBy: !!me?.referredBy,
    canApplyCode: !me?.referredBy && !hasPaid,
    friends: friends.map((f) => {
      const t = rewards.get(String(f.user))
      return { name: String(users.get(String(f.user))?.name || 'New client').split(/\s+/)[0], joinedAt: f.referredAt ?? f.createdAt, rewarded: !!t, reward: t ? toRupees(t.amountPaise) : null }
    }),
  }
}
