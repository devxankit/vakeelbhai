import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireAdmin } from '../../middleware/auth.js'
import { badRequest } from '../../utils/errors.js'
import { ok } from '../../utils/http.js'
import { audit, diff } from '../audit/audit.service.js'
import { Settings } from './settings.model.js'
import { fromAdminPatch, getSettings, toAdminView } from './settings.service.js'

const twoDp = (n) => Math.round(n * 100) === n * 100
const percent = z.number().min(0).max(100).refine(twoDp, 'At most 2 decimal places')
const rupees = z.number().min(0).max(10_000_000).refine(twoDp, 'At most 2 decimal places')

const patchSchema = z
  .object({
    commissionPercent: percent.optional(),
    gstPercent: percent.optional(),
    autoConfirmDays: z.number().int().min(1).max(90).optional(),
    quoteValidityDays: z.number().int().min(1).max(90).optional(),
    walletMaxUsePercent: percent.nullable().optional(),
    minWithdrawal: rupees.nullable().optional(),
    challanFee: rupees.nullable().optional(),
    invoice: z
      .object({
        legalName: z.string().trim().min(2).max(120),
        gstin: z.string().trim().toUpperCase().regex(/^(|[0-9A-Z]{15})$/, 'GSTIN: 15 letters and digits'),
        address: z.string().trim().max(300),
        email: z.union([z.literal(''), z.string().trim().email().max(120)]),
      })
      .partial()
      .strict()
      .optional(),
    challanPayHours: z.number().int().min(1).max(240).optional(),
    supportWhatsApp: z.string().trim().regex(/^(|\d{10,15})$/, 'Digits only, with the country code, e.g. 919876543210').optional(),
    referral: z
      .object({
        enabled: z.boolean().optional(),
        rewardType: z.enum(['flat', 'percent']).nullable().optional(),
        rewardValue: rupees.nullable().optional(),
        monthlyCap: rupees.nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict()

export function settingsRoutes() {
  const r = Router()

  r.get('/', requireAdmin(), async (_req, res) => ok(res, toAdminView(await getSettings())))

  /** Business settings change money for everyone, so only super admins may edit them. */
  r.patch('/', requireAdmin('super_admin'), validate({ body: patchSchema }), async (req, res) => {
    const current = await getSettings()
    const next = fromAdminPatch(req.valid.body, current)
    const ref = next.referral ?? current.referral
    if (ref?.enabled && (!ref.rewardType || ref.rewardValue == null)) throw badRequest('Set the referral reward type and value before switching referrals on')
    if (ref?.rewardType === 'percent' && ref.rewardValue > 10000) throw badRequest('A percentage reward cannot be more than 100%')

    const before = current.toObject()
    const updated = await Settings.findOneAndUpdate({ _id: 'global' }, { $set: { ...next, updatedBy: req.auth.id } }, { new: true, runValidators: true })
    const d = diff(before, next)
    if (d.changed) await audit(req, { action: 'settings.updated', entityType: 'Settings', entityId: 'global', before: d.before, after: d.after })
    ok(res, toAdminView(updated))
  })

  return r
}
