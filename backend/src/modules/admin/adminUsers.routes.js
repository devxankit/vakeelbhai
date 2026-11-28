import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { badRequest, notFound } from '../../utils/errors.js'
import { created, ok } from '../../utils/http.js'
import { revokeAllFor } from '../auth/tokens.js'
import { audit } from '../audit/audit.service.js'
import { ADMIN_ROLES, AdminUser } from './adminUser.model.js'
import { BCRYPT_COST, passwordRule } from './adminAuth.routes.js'

const id = z.object({ id: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid id') })

/** Admin staff accounts. Super admins only. */
export function adminUsersRoutes() {
  const r = Router()
  r.use(requireAdmin('super_admin'))

  r.get('/', async (_req, res) => {
    const list = await AdminUser.find().sort({ createdAt: 1 })
    ok(res, list.map((a) => a.toPublic()))
  })

  r.post(
    '/',
    validate({ body: z.object({ name: z.string().trim().min(2).max(80), email: z.string().trim().toLowerCase().email().max(120), role: z.enum(ADMIN_ROLES), password: passwordRule }) }),
    async (req, res) => {
      const { password, ...rest } = req.valid.body
      const admin = await AdminUser.create({ ...rest, passwordHash: await bcrypt.hash(password, BCRYPT_COST), createdBy: req.auth.id })
      await audit(req, { action: 'admin_user.created', entityType: 'AdminUser', entityId: admin.id, after: { name: admin.name, email: admin.email, role: admin.role } })
      created(res, admin.toPublic())
    },
  )

  r.patch(
    '/:id',
    validate({ params: id, body: z.object({ name: z.string().trim().min(2).max(80).optional(), role: z.enum(ADMIN_ROLES).optional(), status: z.enum(['active', 'disabled']).optional() }).strict() }),
    async (req, res) => {
      const admin = await AdminUser.findById(req.valid.params.id)
      if (!admin) throw notFound('Admin user')
      const p = req.valid.body
      if (admin.id === req.auth.id && (p.status === 'disabled' || (p.role && p.role !== 'super_admin'))) throw badRequest('You cannot disable yourself or remove your own super admin role')
      if (admin.role === 'super_admin' && ((p.role && p.role !== 'super_admin') || p.status === 'disabled')) {
        const others = await AdminUser.countDocuments({ role: 'super_admin', status: 'active', _id: { $ne: admin._id } })
        if (!others) throw badRequest('Keep at least one active super admin')
      }
      const before = { name: admin.name, role: admin.role, status: admin.status }
      Object.assign(admin, p)
      await admin.save()
      if (p.status === 'disabled' || (p.role && p.role !== before.role)) await revokeAllFor(admin._id, 'changed_by_admin')
      await audit(req, { action: 'admin_user.updated', entityType: 'AdminUser', entityId: admin.id, before, after: { name: admin.name, role: admin.role, status: admin.status } })
      ok(res, admin.toPublic())
    },
  )

  /** Set a new password for another admin (e.g. they forgot it). Ends their sessions. */
  r.post('/:id/password', validate({ params: id, body: z.object({ password: passwordRule }) }), async (req, res) => {
    const admin = await AdminUser.findById(req.valid.params.id)
    if (!admin) throw notFound('Admin user')
    admin.passwordHash = await bcrypt.hash(req.valid.body.password, BCRYPT_COST)
    admin.passwordChangedAt = new Date()
    await admin.save()
    await AdminUser.updateOne({ _id: admin._id }, { $set: { failedLogins: 0 }, $unset: { lockUntil: 1 } })
    await revokeAllFor(admin._id, 'password_reset')
    await audit(req, { action: 'admin_user.password_reset', entityType: 'AdminUser', entityId: admin.id })
    ok(res, { reset: true })
  })

  return r
}
