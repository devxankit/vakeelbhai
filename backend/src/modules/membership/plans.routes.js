import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { notFound } from '../../utils/errors.js'
import { created, ok } from '../../utils/http.js'
import { toPaise, toRupees } from '../../utils/money.js'
import { audit, diff } from '../audit/audit.service.js'
import { MembershipPlan } from './plan.model.js'

/** Shape of mobile-app PLANS: { id, name, note, months, price (₹, null = [PRICE]), best }. */
export const toPublicPlan = (p) => ({ id: p.id, name: p.name, note: p.note, months: p.durationMonths, price: p.pricePaise == null ? null : toRupees(p.pricePaise), best: p.highlight, benefits: p.benefits })

const toAdmin = (p) => ({ id: p.id, name: p.name, durationMonths: p.durationMonths, price: p.pricePaise == null ? null : toRupees(p.pricePaise), benefits: p.benefits, note: p.note, highlight: p.highlight, active: p.active, order: p.order, updatedAt: p.updatedAt })

const fields = {
  name: z.string().trim().min(2).max(40),
  durationMonths: z.number().int().min(1).max(60),
  price: z.number().min(0).max(10_000_000).refine((n) => Math.round(n * 100) === n * 100, 'At most 2 decimal places').nullable(),
  benefits: z.array(z.string().trim().min(1).max(120)).max(10),
  note: z.string().trim().max(80),
  highlight: z.boolean(),
  active: z.boolean(),
  order: z.number().int().min(0).max(1000),
}
const toStored = ({ price, ...rest }) => (price === undefined ? rest : { ...rest, pricePaise: price == null ? null : toPaise(price) })

/** Plans and prices change money, so only super admins edit them; staff can view. */
export function adminPlanRoutes() {
  const r = Router()
  r.get('/', requireAdmin(), async (_req, res) => ok(res, (await MembershipPlan.find().sort({ order: 1, createdAt: 1 })).map(toAdmin)))

  r.post('/', requireAdmin('super_admin'), validate({ body: z.object({ ...fields, price: fields.price.optional().default(null), benefits: fields.benefits.optional().default([]), note: fields.note.optional().default(''), highlight: fields.highlight.optional().default(false), active: fields.active.optional().default(true), order: fields.order.optional() }) }), async (req, res) => {
    const p = await MembershipPlan.create({ ...toStored(req.valid.body), updatedBy: req.auth.id })
    await audit(req, { action: 'plan.created', entityType: 'MembershipPlan', entityId: p.id, after: toAdmin(p) })
    created(res, toAdmin(p))
  })

  r.patch('/:id', requireAdmin('super_admin'), validate({ params: z.object({ id: z.string().regex(/^[a-f0-9]{24}$/) }), body: z.object(fields).partial().strict() }), async (req, res) => {
    const p = await MembershipPlan.findById(req.valid.params.id)
    if (!p) throw notFound('Plan')
    const before = toAdmin(p)
    p.set({ ...toStored(req.valid.body), updatedBy: req.auth.id })
    await p.save()
    const after = toAdmin(p)
    const d = diff(before, Object.fromEntries(Object.keys(req.valid.body).map((k) => [k, after[k]])))
    if (d.changed) await audit(req, { action: 'plan.updated', entityType: 'MembershipPlan', entityId: p.id, before: d.before, after: d.after })
    ok(res, after)
  })
  return r
}
