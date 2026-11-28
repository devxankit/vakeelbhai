import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { AuditLog } from '../audit/auditLog.model.js'
import { User } from '../users/user.model.js'
import { Category } from '../categories/category.model.js'
import { AdvocateProfile } from '../advocates/advocate.models.js'
import { ServiceRequest } from '../requests/request.models.js'
import { moneyStats } from '../payments/payment.routes.js'
import { openTicketCount } from '../support/support.routes.js'
import { ChallanOrder } from '../challans/challan.models.js'
import { GstFiling } from '../gstfiling/gstfiling.models.js'

/** Dashboard numbers. More figures (earnings, commission, GST) arrive with the modules that produce them. */
export function adminDashboardRoutes() {
  const r = Router()
  r.get('/', requireAdmin(), async (_req, res) => {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000)
    const [byRole, newByRole, categories, verif] = await Promise.all([
      User.aggregate([{ $match: { status: { $ne: 'deleted' } } }, { $group: { _id: { role: '$role', status: '$status' }, n: { $sum: 1 } } }]),
      User.aggregate([{ $match: { createdAt: { $gte: since }, status: { $ne: 'deleted' } } }, { $group: { _id: '$role', n: { $sum: 1 } } }]),
      Category.countDocuments({ active: true }),
      AdvocateProfile.aggregate([{ $group: { _id: '$verification.status', n: { $sum: 1 } } }]),
    ])
    const reqs = await ServiceRequest.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }])
    const v = (s) => verif.find((x) => x._id === s)?.n ?? 0
    const count = (role, status) => byRole.filter((x) => x._id.role === role && (!status || x._id.status === status)).reduce((a, x) => a + x.n, 0)
    ok(res, {
      clients: { total: count('client'), blocked: count('client', 'blocked'), last30Days: newByRole.find((x) => x._id === 'client')?.n ?? 0 },
      advocates: { total: count('advocate'), blocked: count('advocate', 'blocked'), last30Days: newByRole.find((x) => x._id === 'advocate')?.n ?? 0 },
      activeCategories: categories,
      verification: { pending: v('pending'), reupload: v('reupload'), approved: v('approved'), rejected: v('rejected') },
      requests: { unassigned: reqs.find((x) => x._id === 'submitted')?.n ?? 0, waiting: reqs.find((x) => x._id === 'assigned')?.n ?? 0, active: reqs.filter((x) => ['accepted', 'quoted', 'paid', 'done'].includes(x._id)).reduce((a, x) => a + x.n, 0), disputed: reqs.find((x) => x._id === 'disputed')?.n ?? 0, completed: reqs.find((x) => x._id === 'completed')?.n ?? 0 },
      money: await moneyStats(),
      support: { open: await openTicketCount() },
      gstFilings: { open: await GstFiling.countDocuments({ status: { $in: ['requested', 'in_review', 'documents_needed'] } }) },
      challans: { processing: await ChallanOrder.countDocuments({ status: 'processing' }), overdue: await ChallanOrder.countDocuments({ status: 'processing', dueBy: { $lt: new Date() } }) },
    })
  })
  return r
}

const auditQuery = z.object({
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  entityType: z.string().max(40).optional(),
  action: z.string().max(60).optional(),
})

export function adminAuditRoutes() {
  const r = Router()
  r.get('/', requireAdmin(), validate({ query: auditQuery }), async (req, res) => {
    const q = req.valid.query
    const pg = pageArgs(q)
    const filter = {}
    if (q.entityType) filter.entityType = q.entityType
    if (q.action) filter.action = new RegExp('^' + escapeRegex(q.action))
    const [items, total] = await Promise.all([AuditLog.find(filter).sort({ createdAt: -1 }).skip(pg.skip).limit(pg.limit).lean(), AuditLog.countDocuments(filter)])
    ok(
      res,
      items.map((a) => ({ id: String(a._id), at: a.createdAt, actorEmail: a.actorEmail, action: a.action, entityType: a.entityType, entityId: a.entityId, before: a.before, after: a.after, note: a.note })),
      pageMeta(pg, total),
    )
  })
  return r
}
