import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { badRequest, notFound } from '../../utils/errors.js'
import { created, ok } from '../../utils/http.js'
import { bpToFraction, bpToPercent, percentToBp } from '../../utils/money.js'
import { audit, diff } from '../audit/audit.service.js'
import { withTransaction } from '../../config/db.js'
import { Category } from './category.model.js'

/** Shape the apps use (frontend/src/lib/catalog.js, mobile-app/src/data/catalog.ts). */
export const toPublicCategory = (c) => ({
  key: c.key,
  name: c.name,
  short: c.short,
  covers: c.covers,
  long: c.description,
  docs: c.typicalDocs,
  gstOnService: c.gstOnService,
  commission: c.commissionBp == null ? null : bpToFraction(c.commissionBp),
})

const toAdminCategory = (c) => ({
  id: c.id,
  key: c.key,
  name: c.name,
  short: c.short,
  covers: c.covers,
  description: c.description,
  typicalDocs: c.typicalDocs,
  order: c.order,
  active: c.active,
  gstOnService: c.gstOnService,
  commissionPercent: c.commissionBp == null ? null : bpToPercent(c.commissionBp),
  updatedAt: c.updatedAt,
})

const fields = {
  name: z.string().trim().min(2).max(60),
  short: z.string().trim().min(2).max(30),
  covers: z.string().trim().max(160),
  description: z.string().trim().max(1000),
  typicalDocs: z.array(z.string().trim().min(1).max(80)).max(10),
  active: z.boolean(),
  gstOnService: z.boolean(),
  commissionPercent: z.number().min(0).max(100).refine((n) => Math.round(n * 100) === n * 100, 'At most 2 decimal places').nullable(),
}

const createSchema = z.object({
  key: z.string().trim().toLowerCase().regex(/^[a-z][a-z0-9-]{1,39}$/, 'Lowercase letters, digits and dashes, starting with a letter'),
  ...fields,
  covers: fields.covers.optional().default(''),
  description: fields.description.optional().default(''),
  typicalDocs: fields.typicalDocs.optional().default([]),
  active: fields.active.optional().default(true),
  gstOnService: fields.gstOnService.optional().default(true),
  commissionPercent: fields.commissionPercent.optional().default(null),
})

const toStored = (p) => {
  const { commissionPercent, ...rest } = p
  return commissionPercent === undefined ? rest : { ...rest, commissionBp: commissionPercent == null ? null : percentToBp(commissionPercent) }
}

const idParam = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id') })

/** Admin category management. Staff may manage categories; commission overrides need a super admin. */
export function adminCategoryRoutes() {
  const r = Router()
  r.use(requireAdmin())

  r.get('/', async (_req, res) => {
    const list = await Category.find().sort({ order: 1, createdAt: 1 })
    ok(res, list.map(toAdminCategory))
  })

  r.post('/', validate({ body: createSchema }), async (req, res) => {
    const p = req.valid.body
    if (p.commissionPercent != null && req.auth.role !== 'super_admin') throw badRequest('Only a super admin can set a commission rate')
    const last = await Category.findOne().sort({ order: -1 }).select('order').lean()
    const c = await Category.create({ ...toStored(p), order: (last?.order ?? -1) + 1, updatedBy: req.auth.id })
    await audit(req, { action: 'category.created', entityType: 'Category', entityId: c.id, after: toAdminCategory(c) })
    created(res, toAdminCategory(c))
  })

  r.patch('/:id', validate({ params: idParam, body: z.object(fields).partial().strict() }), async (req, res) => {
    const c = await Category.findById(req.valid.params.id)
    if (!c) throw notFound('Category')
    const p = req.valid.body
    if (p.commissionPercent !== undefined && req.auth.role !== 'super_admin') throw badRequest('Only a super admin can change a commission rate')
    const before = toAdminCategory(c)
    c.set({ ...toStored(p), updatedBy: req.auth.id })
    await c.save()
    const after = toAdminCategory(c)
    const d = diff(before, Object.fromEntries(Object.keys(p).map((k) => [k, after[k]])))
    if (d.changed) await audit(req, { action: 'category.updated', entityType: 'Category', entityId: c.id, before: d.before, after: d.after })
    ok(res, after)
  })

  /** Set the display order: send every category id once, in the new order. */
  r.put('/order', validate({ body: z.object({ ids: z.array(idParam.shape.id).min(1).max(200) }) }), async (req, res) => {
    const { ids } = req.valid.body
    const all = await Category.find().select('_id').lean()
    const known = new Set(all.map((c) => String(c._id)))
    if (new Set(ids).size !== ids.length || ids.length !== known.size || ids.some((i) => !known.has(i))) throw badRequest('Send every category id exactly once')
    await withTransaction(async (session) => {
      await Category.bulkWrite(ids.map((id, i) => ({ updateOne: { filter: { _id: id }, update: { $set: { order: i } } } })), { session })
      await audit(req, { action: 'category.reordered', entityType: 'Category', after: { ids } }, session)
    })
    const list = await Category.find().sort({ order: 1 })
    ok(res, list.map(toAdminCategory))
  })

  return r
}
