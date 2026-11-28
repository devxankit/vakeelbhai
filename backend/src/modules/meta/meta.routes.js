import { Router } from 'express'
import { ok } from '../../utils/http.js'
import { Category } from '../categories/category.model.js'
import { toPublicCategory } from '../categories/categories.routes.js'
import { getSettings, toPublicView } from '../settings/settings.service.js'
import { MembershipPlan } from '../membership/plan.model.js'
import { toPublicPlan } from '../membership/plans.routes.js'
import { challanEnabled } from '../../providers/challan/index.js'
import { SUPPORT_TOPICS } from '../support/support.models.js'
import { VEHICLE_TYPES } from '../challans/challan.models.js'
import { GST_RETURN_TYPES } from '../gstfiling/gstfiling.models.js'

/**
 * GET /api/meta: everything the apps load at start-up instead of the sample catalog.
 * Public (the website shows categories before login). Plans, offers and banners are
 * added here in later phases.
 */
export function metaRoutes() {
  const r = Router()
  r.get('/', async (_req, res) => {
    const [categories, plans, settings] = await Promise.all([Category.find({ active: true }).sort({ order: 1, createdAt: 1 }), MembershipPlan.find({ active: true }).sort({ order: 1, createdAt: 1 }), getSettings()])
    res.set('Cache-Control', 'public, max-age=60')
    const pub = toPublicView(settings)
    ok(res, { categories: categories.map(toPublicCategory), plans: plans.map(toPublicPlan), ...pub, challan: { ...pub.challan, lookup: challanEnabled(), vehicleTypes: VEHICLE_TYPES }, supportTopics: SUPPORT_TOPICS, gstReturnTypes: GST_RETURN_TYPES })
  })
  return r
}
