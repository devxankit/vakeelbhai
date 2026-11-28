import { Router } from 'express'
import { z } from 'zod'
import { validate } from '../../middleware/validate.js'
import { requireUser } from '../../middleware/auth.js'
import { ok } from '../../utils/http.js'
import { ClientProfile } from './clientProfile.model.js'

const view = (user, p) => ({ user: user.toPublic(), city: p.city, state: p.state, complete: !!user.name })

const getProfile = (userId) => ClientProfile.findOneAndUpdate({ user: userId }, { $setOnInsert: { user: userId } }, { upsert: true, new: true, setDefaultsOnInsert: true })

/** Client profile (SOW 5.1). OTP first, the rest can be filled in later (SCOPE-OF-WORK 4.1). */
export function clientRoutes() {
  const r = Router()
  r.use(requireUser('client'))

  r.get('/profile', async (req, res) => ok(res, view(req.auth.user, await getProfile(req.auth.user._id))))

  r.patch(
    '/profile',
    validate({
      body: z
        .object({
          name: z.string().trim().min(2).max(80),
          email: z.union([z.literal(''), z.string().trim().toLowerCase().email().max(120)]),
          city: z.string().trim().max(60),
          state: z.string().trim().max(60),
        })
        .partial()
        .strict(),
    }),
    async (req, res) => {
      const { name, email, city, state } = req.valid.body
      const user = req.auth.user
      if (name !== undefined) user.name = name
      if (email !== undefined) user.email = email
      await user.save()
      const set = {}
      if (city !== undefined) set.city = city
      if (state !== undefined) set.state = state
      const p = Object.keys(set).length ? await ClientProfile.findOneAndUpdate({ user: user._id }, { $set: set }, { upsert: true, new: true }) : await getProfile(user._id)
      ok(res, view(user, p))
    },
  )

  return r
}
