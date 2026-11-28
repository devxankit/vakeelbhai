import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireUser } from '../../middleware/auth.js'
import { notFound } from '../../utils/errors.js'
import { escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { sendPrivate } from '../../providers/storage/privateFiles.js'
import { User } from '../users/user.model.js'
import { Category } from '../categories/category.model.js'
import { Membership } from '../membership/membership.model.js'
import { AdvocateProfile } from './advocate.models.js'

/**
 * Explore tab (client app and website): the advocates registered on Vakeel Bhai.
 * Listed: verified, not blocked, with an active membership. Shown: photo, name and
 * designation ONLY. No phone, email, enrolment number or district details: clients are
 * still matched by the admin, and contact happens only in the private chat.
 */
async function listedIds() {
  const now = new Date()
  const [profiles, members] = await Promise.all([
    AdvocateProfile.find({ 'verification.status': 'approved' }).select('user practice photo').lean(),
    Membership.find({ revokedAt: null, startAt: { $lte: now }, endAt: { $gt: now } }).distinct('user'),
  ])
  const active = new Set(members.map(String))
  return profiles.filter((p) => active.has(String(p.user)))
}

/** "Criminal lawyer", from the advocate's first practice area. */
export function designation(practice, categoryNames) {
  const first = practice?.[0]
  return (first && categoryNames.get(first)) || 'Advocate'
}

export function exploreRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  r.get(
    '/',
    validate({ query: z.object({ category: z.string().max(40).optional(), q: z.string().trim().max(40).optional(), page: z.coerce.number().int().min(1).optional(), limit: z.coerce.number().int().min(1).max(60).optional() }) }),
    async (req, res) => {
      const q = req.valid.query
      const pg = pageArgs({ ...q, limit: q.limit ?? 30 })
      let profiles = await listedIds()
      if (q.category) profiles = profiles.filter((p) => p.practice.includes(q.category))
      const userFilter = { _id: { $in: profiles.map((p) => p.user) }, role: 'advocate', status: 'active' }
      if (q.q) userFilter.name = new RegExp(escapeRegex(q.q), 'i')
      const [users, total, cats] = await Promise.all([
        User.find(userFilter).select('name').sort({ name: 1 }).skip(pg.skip).limit(pg.limit).lean(),
        User.countDocuments(userFilter),
        Category.find().select('key name').lean(),
      ])
      const names = new Map(cats.map((c) => [c.key, c.name]))
      const byUser = new Map(profiles.map((p) => [String(p.user), p]))
      ok(
        res,
        users.map((u) => {
          const p = byUser.get(String(u._id))
          return { id: String(u._id), name: 'Adv. ' + u.name, designation: designation(p?.practice, names), hasPhoto: !!p?.photo }
        }),
        pageMeta(pg, total),
      )
    },
  )

  /** Photo of a listed advocate only. */
  r.get('/:id/photo', validate({ params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }) }), async (req, res) => {
    const listed = await listedIds()
    const p = listed.find((x) => String(x.user) === req.valid.params.id)
    const u = p && (await User.exists({ _id: p.user, status: 'active' }))
    if (!p?.photo || !u) throw notFound('Photo')
    await sendPrivate(res, p.photo)
  })

  return r
}
