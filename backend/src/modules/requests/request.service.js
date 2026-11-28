import { notFound } from '../../utils/errors.js'
import { toRupees } from '../../utils/money.js'
import { toAdmins, toUser } from '../../realtime/io.js'
import { User } from '../users/user.model.js'
import { AdvocateProfile } from '../advocates/advocate.models.js'
import { ClientProfile } from '../clients/clientProfile.model.js'
import { Membership } from '../membership/membership.model.js'
import { Message, ServiceRequest } from './request.models.js'
import { Payment } from '../payments/payment.models.js'

/** Chat is open from acceptance until completion. */
export const CHAT_OPEN = ['accepted', 'quoted', 'paid', 'done', 'disputed']
/** Statuses where the client can see (and talk to) their advocate. */
const ADVOCATE_VISIBLE = ['accepted', 'quoted', 'paid', 'done', 'completed', 'disputed', 'refunded']
const ACTIVE_FOR_CLIENT = ['submitted', 'assigned', 'accepted', 'quoted', 'paid', 'done', 'disputed']

/** The client never sees an assignment the advocate has not accepted (SCOPE-OF-WORK 1.3). App vocabulary: accepted → "assigned". */
export function toClientStatus(s) {
  if (s === 'assigned') return 'submitted'
  if (s === 'accepted') return 'assigned'
  return s
}

/** Advocate vocabulary (app CaseStatus). */
export function toCaseStatus(r, advocateId) {
  const mine = r.advocate && String(r.advocate) === String(advocateId)
  if (!mine) return 'declined'
  return r.status === 'assigned' ? 'new' : r.status
}

const iso = (d) => (d ? new Date(d).toISOString() : null)
const quoteView = (q) => (q ? { fee: toRupees(q.feePaise), scope: q.scope, validTill: iso(q.validTill), at: iso(q.sentAt) } : null)

/** "Rakesh Yadav" → "Rakesh Y." (advocates see first name + initial; never a phone number). */
export function shortName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'Client'
  return parts.length === 1 ? parts[0] : parts[0] + ' ' + parts[parts.length - 1][0].toUpperCase() + '.'
}

/** A one-line title from the issue text (the request form has no separate title). */
export function titleFrom(issue) {
  const first = String(issue).split(/(?<=[.!?])\s/)[0].trim()
  return first.length > 70 ? first.slice(0, 67).trimEnd() + '…' : first
}

/** What a client sees of their advocate once accepted: name, photo, verified badge, experience, practice, court. No phone. */
export async function advocateCard(advocateId) {
  const [u, p] = await Promise.all([User.findById(advocateId).lean(), AdvocateProfile.findOne({ user: advocateId }).lean()])
  if (!u) return null
  return { id: String(u._id), name: 'Adv. ' + u.name, verified: p?.verification?.status === 'approved', years: p?.experienceYears ?? null, practice: p?.practice ?? [], court: p?.courts ?? '', district: p?.district ?? '', hasPhoto: !!p?.photo }
}

/** Payment summary in the app's `paid` shape: { fee, discount, base, gst, wallet, total, at }. */
async function paidView(r) {
  if (!r.payment) return null
  const p = await Payment.findById(r.payment).lean()
  if (!p) return null
  return { id: p.number, fee: toRupees(p.amounts.feePaise), discount: toRupees(p.amounts.discountPaise), base: toRupees(p.amounts.basePaise), gst: toRupees(p.amounts.gstPaise), wallet: toRupees(p.amounts.walletPaise), total: toRupees(p.amounts.totalPaise + p.amounts.walletPaise), at: iso(p.paidAt), status: p.status, refund: p.refund?.status ?? null, payout: p.payout ? { commission: toRupees(p.payout.commissionPaise), gstOnCommission: toRupees(p.payout.gstOnCommissionPaise), net: toRupees(p.payout.netPaise), commissionPercent: p.rates.commissionBp / 100, gstPercent: p.rates.gstBp / 100 } : null }
}

const afterPayment = (r) => ({ doneAt: iso(r.doneAt), autoConfirmAt: iso(r.autoConfirmAt), completedAt: iso(r.completedAt), rating: r.rating ?? null, review: r.review ?? null, dispute: r.dispute ? { reason: r.dispute.reason, status: r.dispute.status, at: iso(r.dispute.at), note: r.dispute.note ?? null } : null })

export async function clientView(r) {
  const show = ADVOCATE_VISIBLE.includes(r.status) && r.advocate
  const paid = await paidView(r)
  if (paid) delete paid.payout
  return {
    paid,
    ...afterPayment(r),
    id: r.number,
    category: r.category,
    issue: r.issue,
    district: r.district,
    lang: r.language,
    docs: r.attachments.map((a) => ({ id: String(a._id), at: iso(a.createdAt) })),
    createdAt: iso(r.createdAt),
    status: toClientStatus(r.status),
    advocate: show ? await advocateCard(r.advocate) : null,
    assignedAt: show ? iso(r.acceptedAt) : null,
    quote: quoteView(r.quote),
  }
}

export async function caseView(r, advocateId) {
  const client = await User.findById(r.client).select('name').lean()
  const mine = r.assignments.filter((a) => String(a.advocate) === String(advocateId)).at(-1)
  const paid = toCaseStatus(r, advocateId) === 'declined' ? null : await paidView(r)
  return {
    // The advocate sees their payout, not the client's GST or wallet use.
    payout: paid?.payout ?? null,
    paidAt: paid?.at ?? null,
    ...afterPayment(r),
    id: r.number,
    category: r.category,
    title: titleFrom(r.issue),
    issue: r.issue,
    clientName: shortName(client?.name),
    district: r.district,
    lang: r.language,
    docs: r.attachments.map((a) => ({ id: String(a._id) })),
    assignedAt: iso(mine?.assignedAt),
    status: toCaseStatus(r, advocateId),
    quote: quoteView(r.quote),
    declineReason: mine?.response === 'declined' ? mine.reason : null,
  }
}

export function messageView(m) {
  return {
    id: String(m._id),
    from: m.from,
    kind: m.kind,
    text: m.text ?? null,
    hasFile: !!m.file,
    quote: m.quote ? { fee: toRupees(m.quote.feePaise), scope: m.quote.scope, validTill: iso(m.quote.validTill) } : null,
    at: iso(m.createdAt),
  }
}

/** Load a request by its number for a client or advocate, enforcing who may see it. */
export async function requestFor(number, auth) {
  const r = await ServiceRequest.findOne({ number })
  if (!r) throw notFound('Request')
  if (auth.kind === 'admin') return r
  if (auth.role === 'client' && String(r.client) === auth.id) return r
  if (auth.role === 'advocate') {
    if (r.advocate && String(r.advocate) === auth.id) return r
    // An advocate who declined keeps a read-only record of it (app: "You declined this request").
    if (r.assignments.some((a) => String(a.advocate) === auth.id && a.response === 'declined')) return r
  }
  throw notFound('Request')
}

/** Which side of the chat the caller is on, or null if they may not read it. */
export function chatSide(r, auth) {
  if (auth.role === 'client' && String(r.client) === auth.id) return 'client'
  if (auth.role === 'advocate' && r.advocate && String(r.advocate) === auth.id && ADVOCATE_VISIBLE.includes(r.status)) return 'advocate'
  return null
}

export async function systemMessage(r, text, session) {
  const [m] = await Message.create([{ request: r._id, from: 'system', kind: 'text', text }], session ? { session } : undefined)
  return m
}

/** Tell everyone involved that a request changed. */
export function notifyChange(r, extraUsers = []) {
  const payload = { number: r.number }
  toUser(r.client, 'request:update', payload)
  if (r.advocate) toUser(r.advocate, 'request:update', payload)
  for (const u of extraUsers) toUser(u, 'request:update', payload)
  toAdmins('queue:update', payload)
}

export function notifyMessage(r, m) {
  const payload = { number: r.number, message: messageView(m) }
  toUser(r.client, 'message', payload)
  if (r.advocate && CHAT_OPEN.concat(['completed']).includes(r.status)) toUser(r.advocate, 'message', payload)
}

export const clientTabFilter = (tab) => (tab === 'completed' ? { status: { $in: ['completed', 'refunded'] } } : { status: { $in: ACTIVE_FOR_CLIENT } })

/**
 * Advocates the admin may assign to a request: verified, not blocked, with an active
 * membership, practising in the request's category, and who have not declined it before.
 * Same district first (SCOPE-OF-WORK 12: filtered by category, district and active membership).
 */
export async function eligibleAdvocates(r) {
  const declined = new Set(r.assignments.filter((a) => a.response === 'declined').map((a) => String(a.advocate)))
  const profiles = await AdvocateProfile.find({ 'verification.status': 'approved', practice: r.category }).lean()
  const ids = profiles.map((p) => p.user).filter((id) => !declined.has(String(id)))
  const now = new Date()
  const [users, members, load] = await Promise.all([
    User.find({ _id: { $in: ids }, role: 'advocate', status: 'active' }).lean(),
    Membership.find({ user: { $in: ids }, revokedAt: null, startAt: { $lte: now }, endAt: { $gt: now } }).lean(),
    ServiceRequest.aggregate([{ $match: { advocate: { $in: ids }, status: { $in: ['assigned', 'accepted', 'quoted', 'paid', 'done'] } } }, { $group: { _id: '$advocate', n: { $sum: 1 } } }]),
  ])
  const memberOf = new Map(members.map((m) => [String(m.user), m]))
  const userOf = new Map(users.map((u) => [String(u._id), u]))
  const activeOf = new Map(load.map((x) => [String(x._id), x.n]))
  const district = r.district.toLowerCase()
  return profiles
    .filter((p) => userOf.has(String(p.user)) && memberOf.has(String(p.user)) && !declined.has(String(p.user)))
    .map((p) => {
      const u = userOf.get(String(p.user))
      return {
        id: String(u._id),
        name: u.name,
        district: p.district,
        sameDistrict: p.district.toLowerCase() === district,
        practice: p.practice,
        years: p.experienceYears,
        courts: p.courts,
        activeCases: activeOf.get(String(u._id)) ?? 0,
        membershipEnds: memberOf.get(String(u._id)).endAt,
        current: r.advocate ? String(r.advocate) === String(u._id) : false,
      }
    })
    .sort((a, b) => Number(b.sameDistrict) - Number(a.sameDistrict) || a.activeCases - b.activeCases || a.name.localeCompare(b.name))
}

/** Client display info for the admin (full name and phone: admins only). */
export async function clientInfo(userId) {
  const [u, p] = await Promise.all([User.findById(userId).lean(), ClientProfile.findOne({ user: userId }).lean()])
  return u ? { id: String(u._id), name: u.name, phone: u.phone, city: p?.city ?? '', status: u.status } : null
}
