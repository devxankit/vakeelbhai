import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin, requireUser } from '../../middleware/auth.js'
import { conflict, notFound } from '../../utils/errors.js'
import { created, escapeRegex, ok, pageArgs, pageMeta } from '../../utils/http.js'
import { toRupees } from '../../utils/money.js'
import { audit } from '../audit/audit.service.js'
import { User } from '../users/user.model.js'
import { paymentView, startChallanCheckout } from '../payments/payment.service.js'
import { ChallanOrder, normalisePlate, PLATE_RE, VEHICLE_TYPES, Vehicle } from './challan.models.js'
import { challansForVehicle, completeChallanOrder, orderView, refundChallanOrder, vehicleView } from './challan.service.js'

const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid vehicle') })
const orderParam = z.object({ number: z.string().regex(/^EC-\d{4,9}$/, 'Invalid order') })
const plate = z
  .string()
  .transform(normalisePlate)
  .refine((p) => PLATE_RE.test(p), 'Enter a valid number plate, e.g. MP 09 AB 1234')

/* ================================================================== client */

export function clientChallanRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  r.get('/vehicles', async (req, res) => {
    const list = await Vehicle.find({ user: req.auth.id, removedAt: null }).sort({ createdAt: 1 }).lean()
    ok(res, list.map(vehicleView))
  })

  /** Add a vehicle (type + number plate). Adding a removed one brings it back. */
  r.post('/vehicles', validate({ body: z.object({ plate, type: z.enum(VEHICLE_TYPES) }) }), async (req, res) => {
    const { plate: p, type } = req.valid.body
    const count = await Vehicle.countDocuments({ user: req.auth.id, removedAt: null })
    if (count >= 10) throw conflict('You can save up to 10 vehicles', 'TOO_MANY_VEHICLES')
    const v = await Vehicle.findOneAndUpdate({ user: req.auth.id, plate: p }, { $set: { type, removedAt: null } }, { upsert: true, new: true, setDefaultsOnInsert: true })
    created(res, vehicleView(v))
  })

  r.delete('/vehicles/:id', validate({ params: idParam }), async (req, res) => {
    const v = await Vehicle.findOneAndUpdate({ _id: req.valid.params.id, user: req.auth.id, removedAt: null }, { $set: { removedAt: new Date() } })
    if (!v) throw notFound('Vehicle')
    ok(res, { removed: true })
  })

  /** The vehicle's challans from the e-Challan provider, marked due / processing / paid. */
  r.get('/vehicles/:id/challans', validate({ params: idParam }), async (req, res) => {
    const v = await Vehicle.findOne({ _id: req.valid.params.id, user: req.auth.id, removedAt: null }).lean()
    if (!v) throw notFound('Vehicle')
    ok(res, { vehicle: vehicleView(v), challans: await challansForVehicle(v, req.auth.id) })
  })

  /** Pay challans: amounts come from the provider again on the server. */
  r.post('/challans/checkout', validate({ body: z.object({ vehicleId: idParam.shape.id, challans: z.array(z.string().trim().min(4).max(40)).min(1).max(20) }) }), async (req, res) => {
    const out = await startChallanCheckout(req.auth, { vehicleId: req.valid.body.vehicleId, challanNos: req.valid.body.challans })
    const g = out.gateway
    created(res, { order: orderView(out.order), payment: paymentView(out.payment), gateway: { provider: g.provider, keyId: g.keyId ?? null, orderId: g.orderId, amount: g.amountPaise, currency: g.currency } })
  })

  r.get('/challans/orders', async (req, res) => {
    const list = await ChallanOrder.find({ user: req.auth.id, status: { $ne: 'cancelled' } }).sort({ createdAt: -1 }).limit(100).lean()
    ok(res, list.filter((o) => o.status !== 'awaiting_payment').map(orderView))
  })

  r.get('/challans/orders/:number', validate({ params: orderParam }), async (req, res) => {
    const o = await ChallanOrder.findOne({ number: req.valid.params.number, user: req.auth.id }).lean()
    if (!o) throw notFound('e-Challan order')
    ok(res, orderView(o))
  })

  return r
}

/* ================================================================== admin */

export function adminChallanRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get(
    '/',
    validate({ query: z.object({ status: z.enum(['processing', 'completed', 'refunded', 'all']).default('processing'), q: z.string().trim().max(30).optional(), page: z.coerce.number().int().min(1).optional() }) }),
    async (req, res) => {
      const q = req.valid.query
      const pg = pageArgs({ ...q, limit: 25 })
      const f = q.status === 'all' ? { status: { $in: ['processing', 'completed', 'refunded'] } } : { status: q.status }
      if (q.q) {
        const re = new RegExp(escapeRegex(normalisePlate(q.q)), 'i')
        f.$or = [{ number: new RegExp(escapeRegex(q.q), 'i') }, { 'vehicle.plate': re }, { 'items.challanNo': re }]
      }
      // Waiting orders: the closest deadline first.
      const sort = q.status === 'processing' ? { dueBy: 1 } : { updatedAt: -1 }
      const [items, total] = await Promise.all([ChallanOrder.find(f).sort(sort).skip(pg.skip).limit(pg.limit).populate('user', 'name phone').lean(), ChallanOrder.countDocuments(f)])
      const now = Date.now()
      ok(
        res,
        items.map((o) => ({ ...orderView(o), client: o.user?.name || 'Client', clientPhone: o.user?.phone ?? null, overdue: o.status === 'processing' && o.dueBy && new Date(o.dueBy).getTime() < now })),
        pageMeta(pg, total),
      )
    },
  )

  r.get('/:number', validate({ params: orderParam }), async (req, res) => {
    const o = await ChallanOrder.findOne({ number: req.valid.params.number }).populate('payment').lean()
    if (!o) throw notFound('e-Challan order')
    const u = await User.findById(o.user).select('name phone').lean()
    ok(res, { ...orderView(o), client: { id: String(o.user), name: u?.name || 'Client', phone: u?.phone ?? null }, payment: o.payment ? { ...paymentView(o.payment), provider: o.payment.provider, gatewayPaymentId: o.payment.gatewayPaymentId ?? null } : null, overdue: o.status === 'processing' && o.dueBy < new Date() })
  })

  /** Our team paid the department: record its receipt or transaction number. */
  r.post('/:number/complete', validate({ params: orderParam, body: z.object({ departmentRef: z.string().trim().min(4, 'Enter the department receipt number').max(60), note: z.string().trim().max(300).optional() }) }), async (req, res) => {
    const o = await completeChallanOrder(req.valid.params.number, { adminId: req.auth.id, ...req.valid.body })
    await audit(req, { action: 'challan.completed', entityType: 'ChallanOrder', entityId: o.number, after: { departmentRef: o.departmentRef, amount: toRupees(o.amounts.challanPaise) } })
    ok(res, orderView(o))
  })

  /** It could not be paid: full refund (challans, charge and GST). Money decision: super admin only. */
  r.post('/:number/refund', requireAdmin('super_admin'), validate({ params: orderParam, body: z.object({ reason: z.string().trim().min(5, 'Explain why').max(300) }) }), async (req, res) => {
    const o = await refundChallanOrder(req.valid.params.number, { adminId: req.auth.id, reason: req.valid.body.reason })
    await audit(req, { action: 'challan.refunded', entityType: 'ChallanOrder', entityId: o.number, after: { amount: toRupees(o.amounts.totalPaise), reason: req.valid.body.reason } })
    ok(res, orderView(o))
  })

  return r
}
