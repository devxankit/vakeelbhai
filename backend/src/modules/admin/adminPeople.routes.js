import { Router } from 'express'
import mongoose from 'mongoose'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { withTransaction } from '../../config/db.js'
import { badRequest, conflict, notFound } from '../../utils/errors.js'
import { escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { sendPrivate } from '../../providers/storage/privateFiles.js'
import { revokeAllFor } from '../auth/tokens.js'
import { audit } from '../audit/audit.service.js'
import { User } from '../users/user.model.js'
import { ClientProfile } from '../clients/clientProfile.model.js'
import { AdvocateDocument, AdvocateProfile, DOC_KEYS, VERIFICATION, VerificationEvent } from '../advocates/advocate.models.js'
import { docsView, membershipSummary } from '../advocates/advocate.service.js'
import { MembershipPlan } from '../membership/plan.model.js'
import { Membership, addMonths, memberIdFor } from '../membership/membership.model.js'
import { notifyUser } from '../notifications/notifications.js'

const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id') })
const listQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().trim().max(60).optional(),
  status: z.string().max(20).optional(),
  district: z.string().trim().max(60).optional(),
})

async function findUser(id, role) {
  const u = await User.findOne({ _id: id, role, status: { $ne: 'deleted' } })
  if (!u) throw notFound(role === 'client' ? 'Client' : 'Advocate')
  return u
}

/** Block or unblock a client or advocate. Blocking ends all their sessions at once. */
function statusRoute(role) {
  return [
    validate({ params: idParam, body: z.object({ status: z.enum(['active', 'blocked']), reason: z.string().trim().max(300).optional() }) }),
    async (req, res) => {
      const { status, reason } = req.valid.body
      if (status === 'blocked' && !reason) throw badRequest('Give a reason for blocking')
      const u = await findUser(req.valid.params.id, role)
      const before = { status: u.status, blockedReason: u.blockedReason ?? null }
      u.status = status
      u.blockedReason = status === 'blocked' ? reason : undefined
      await u.save()
      if (status === 'blocked') await revokeAllFor(u._id, 'blocked_by_admin')
      await audit(req, { action: role + '.' + (status === 'blocked' ? 'blocked' : 'unblocked'), entityType: 'User', entityId: u.id, before, after: { status, blockedReason: reason ?? null } })
      ok(res, u.toPublic())
    },
  ]
}

/* ------------------------------------------------------------------ advocates */

export function adminAdvocateRoutes() {
  const r = Router()
  r.use(requireAdmin())

  /** List with filters: status = draft|pending|reupload|approved|rejected|blocked, q = name/phone/enrolment. */
  r.get('/', validate({ query: listQuery }), async (req, res) => {
    const q = req.valid.query
    const pg = pageArgs(q)
    const match = { role: 'advocate', status: { $ne: 'deleted' } }
    if (q.status === 'blocked') match.status = 'blocked'
    const pipeline = [{ $match: match }, { $lookup: { from: 'advocateprofiles', localField: '_id', foreignField: 'user', as: 'p' } }, { $set: { p: { $first: '$p' } } }]
    const after = {}
    if (q.status && VERIFICATION.includes(q.status)) after['p.verification.status'] = q.status === 'draft' ? { $in: ['draft', null] } : q.status
    if (q.district) after['p.district'] = new RegExp('^' + escapeRegex(q.district) + '$', 'i')
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i')
      after.$or = [{ name: rx }, { phone: rx }, { 'p.enrolmentNumber': rx }]
    }
    if (Object.keys(after).length) pipeline.push({ $match: after })
    // Pending first (oldest submission first, as a queue), then newest accounts.
    pipeline.push({ $set: { _queue: { $cond: [{ $in: ['$p.verification.status', ['pending']] }, 0, 1] } } }, { $sort: { _queue: 1, 'p.verification.submittedAt': 1, createdAt: -1 } })
    const [out] = await User.aggregate([...pipeline, { $facet: { items: [{ $skip: pg.skip }, { $limit: pg.limit }], total: [{ $count: 'n' }] } }])
    ok(
      res,
      out.items.map((u) => ({
        id: String(u._id),
        name: u.name,
        phone: u.phone,
        email: u.email,
        status: u.status,
        district: u.p?.district ?? '',
        state: u.p?.state ?? '',
        practice: u.p?.practice ?? [],
        enrolmentNumber: u.p?.enrolmentNumber ?? '',
        verification: u.p?.verification?.status ?? 'draft',
        submittedAt: u.p?.verification?.submittedAt ?? null,
        joinedAt: u.createdAt,
      })),
      pageMeta(pg, out.total[0]?.n ?? 0),
    )
  })

  r.get('/:id', validate({ params: idParam }), async (req, res) => {
    const u = await findUser(req.valid.params.id, 'advocate')
    const [p, docs, events] = await Promise.all([
      AdvocateProfile.findOne({ user: u._id }).populate('verification.reviewedBy', 'name email').lean(),
      AdvocateDocument.find({ user: u._id }).lean(),
      VerificationEvent.find({ user: u._id }).sort({ createdAt: -1 }).limit(50).populate('byAdmin', 'name email').lean(),
    ])
    ok(res, {
      user: { ...u.toPublic(), blockedReason: u.blockedReason ?? null, lastLoginAt: u.lastLoginAt ?? null },
      profile: {
        address: p?.address ?? '',
        state: p?.state ?? '',
        district: p?.district ?? '',
        practice: p?.practice ?? [],
        experienceYears: p?.experienceYears ?? null,
        courts: p?.courts ?? '',
        enrolmentNumber: p?.enrolmentNumber ?? '',
        hasPhoto: !!p?.photo,
      },
      verification: {
        status: p?.verification?.status ?? 'draft',
        submittedAt: p?.verification?.submittedAt ?? null,
        reviewedAt: p?.verification?.reviewedAt ?? null,
        reviewedBy: p?.verification?.reviewedBy?.name ?? null,
        reason: p?.verification?.reason ?? null,
      },
      documents: docsView(docs),
      membership: await membershipSummary(u._id),
      history: events.map((e) => ({ at: e.createdAt, action: e.action, by: e.byAdmin?.name ?? null, reason: e.reason ?? null, docKey: e.docKey ?? null, docNotes: e.docNotes ? Object.fromEntries(Object.entries(e.docNotes)) : null })),
    })
  })

  r.get('/:id/photo', validate({ params: idParam }), async (req, res) => {
    const p = await AdvocateProfile.findOne({ user: req.valid.params.id }).lean()
    if (!p?.photo) throw notFound('Photo')
    await sendPrivate(res, p.photo)
  })

  r.get('/:id/documents/:key/file', validate({ params: idParam.extend({ key: z.enum(DOC_KEYS) }) }), async (req, res) => {
    const doc = await AdvocateDocument.findOne({ user: req.valid.params.id, key: req.valid.params.key }).lean()
    if (!doc) throw notFound('Document')
    await sendPrivate(res, doc.file)
  })

  /**
   * Review a submitted profile (only while it is `pending`).
   *   approve:  all documents approved, advocate verified
   *   reupload: `docs` names the documents to retake, each with a note; the rest are approved
   *   reject:   refused, `reason` required
   */
  r.post(
    '/:id/review',
    validate({
      params: idParam,
      body: z.object({
        decision: z.enum(['approve', 'reupload', 'reject']),
        reason: z.string().trim().max(500).optional(),
        docs: z.partialRecord(z.enum(DOC_KEYS), z.string().trim().min(3, 'Say what is wrong with the document').max(300)).optional(),
      }),
    }),
    async (req, res) => {
      const { decision, reason, docs = {} } = req.valid.body
      const userId = new mongoose.Types.ObjectId(req.valid.params.id)
      await findUser(userId, 'advocate')
      const retake = Object.keys(docs)
      if (decision === 'reupload' && !retake.length) throw badRequest('Choose at least one document to retake, with a note')
      if (decision === 'reject' && !reason) throw badRequest('Give a reason for rejecting')
      if (decision !== 'reupload' && retake.length) throw badRequest('Document notes are only for a retake request')

      const status = { approve: 'approved', reupload: 'reupload', reject: 'rejected' }[decision]
      await withTransaction(async (session) => {
        // Only a pending profile can be reviewed, and only once: two admins clicking at the same time cannot both win.
        const upd = await AdvocateProfile.updateOne(
          { user: userId, 'verification.status': 'pending' },
          { $set: { 'verification.status': status, 'verification.reviewedAt': new Date(), 'verification.reviewedBy': req.auth.id, 'verification.reason': reason ?? null } },
          { session },
        )
        if (!upd.matchedCount) throw conflict('This profile is not waiting for review (someone may have reviewed it already)', 'NOT_PENDING')
        const present = await AdvocateDocument.find({ user: userId }).select('key').session(session).lean()
        const missingRetake = retake.filter((k) => !present.some((d) => d.key === k))
        if (missingRetake.length) throw badRequest('No such document uploaded: ' + missingRetake.join(', '))
        for (const d of present) {
          const s = decision === 'reject' ? 'rejected' : retake.includes(d.key) ? 'reupload' : 'approved'
          await AdvocateDocument.updateOne({ user: userId, key: d.key }, s === 'reupload' ? { $set: { status: s, note: docs[d.key] } } : { $set: { status: s }, $unset: { note: 1 } }, { session })
        }
        const action = { approve: 'approved', reupload: 'reupload_requested', reject: 'rejected' }[decision]
        await VerificationEvent.create([{ user: userId, action, byAdmin: req.auth.id, reason, docNotes: retake.length ? docs : undefined }], { session })
        await audit(req, { action: 'advocate.' + action, entityType: 'User', entityId: String(userId), after: { status, reason: reason ?? null, docs: retake.length ? docs : undefined } }, session)
      })
      const msg = {
        approve: ['You are verified', 'Your documents are approved. Choose a membership to start receiving client requests.'],
        reupload: ['Document retake needed', retake.length === 1 ? '1 document needs a retake. Open the app to see why.' : retake.length + ' documents need a retake. Open the app to see why.'],
        reject: ['Verification not approved', reason ?? 'Please contact support.'],
      }[decision]
      notifyUser(userId, msg[0], msg[1], { kind: 'verification' })
      ok(res, { status })
    },
  )

  /**
   * Membership control: grant or extend (SCOPE-OF-WORK 12). A new period starts at the end of
   * the current one, or now. Only for verified advocates; always with a reason; audited.
   * Paid memberships are created by the payments module instead.
   */
  r.post(
    '/:id/membership',
    requireAdmin('super_admin'),
    validate({ params: idParam, body: z.object({ planId: z.string().regex(/^[a-f0-9]{24}$/, 'Choose a plan'), reason: z.string().trim().min(5, 'Say why this membership is granted').max(300) }) }),
    async (req, res) => {
      const u = await findUser(req.valid.params.id, 'advocate')
      const p = await AdvocateProfile.findOne({ user: u._id }).lean()
      if (p?.verification?.status !== 'approved') throw badRequest('Only verified advocates can get a membership')
      const plan = await MembershipPlan.findById(req.valid.body.planId)
      if (!plan) throw notFound('Plan')
      await withTransaction(async (session) => {
        const latest = await Membership.findOne({ user: u._id, revokedAt: null }).sort({ endAt: -1 }).session(session)
        const startAt = latest && latest.endAt > new Date() ? latest.endAt : new Date()
        const [doc] = await Membership.create(
          [{ user: u._id, plan: plan._id, planName: plan.name, memberId: await memberIdFor(u._id, session), startAt, endAt: addMonths(startAt, plan.durationMonths), source: 'admin_grant', grantedBy: req.auth.id, reason: req.valid.body.reason }],
          { session },
        )
        await audit(req, { action: 'membership.granted', entityType: 'User', entityId: u.id, after: { plan: plan.name, startAt, endAt: doc.endAt, reason: req.valid.body.reason } }, session)
      })
      notifyUser(u._id, 'Membership active', plan.name + ' membership added by Vakeel Bhai. New client requests will appear on your dashboard.', { kind: 'membership' })
      ok(res, await membershipSummary(u._id))
    },
  )

  r.patch('/:id/status', ...statusRoute('advocate'))
  return r
}

/* ------------------------------------------------------------------ clients */

export function adminClientRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get('/', validate({ query: listQuery }), async (req, res) => {
    const q = req.valid.query
    const pg = pageArgs(q)
    const match = { role: 'client', status: q.status === 'blocked' ? 'blocked' : q.status === 'active' ? 'active' : { $ne: 'deleted' } }
    const pipeline = [{ $match: match }, { $lookup: { from: 'clientprofiles', localField: '_id', foreignField: 'user', as: 'p' } }, { $set: { p: { $first: '$p' } } }]
    if (q.q) {
      const rx = new RegExp(escapeRegex(q.q), 'i')
      pipeline.push({ $match: { $or: [{ name: rx }, { phone: rx }, { email: rx }, { 'p.city': rx }] } })
    }
    pipeline.push({ $sort: { createdAt: -1 } })
    const [out] = await User.aggregate([...pipeline, { $facet: { items: [{ $skip: pg.skip }, { $limit: pg.limit }], total: [{ $count: 'n' }] } }])
    ok(
      res,
      out.items.map((u) => ({ id: String(u._id), name: u.name, phone: u.phone, email: u.email, status: u.status, city: u.p?.city ?? '', state: u.p?.state ?? '', joinedAt: u.createdAt, lastLoginAt: u.lastLoginAt ?? null })),
      pageMeta(pg, out.total[0]?.n ?? 0),
    )
  })

  r.get('/:id', validate({ params: idParam }), async (req, res) => {
    const u = await findUser(req.valid.params.id, 'client')
    const p = await ClientProfile.findOne({ user: u._id }).lean()
    ok(res, { user: { ...u.toPublic(), blockedReason: u.blockedReason ?? null, lastLoginAt: u.lastLoginAt ?? null }, city: p?.city ?? '', state: p?.state ?? '' })
  })

  r.patch('/:id/status', ...statusRoute('client'))
  return r
}
