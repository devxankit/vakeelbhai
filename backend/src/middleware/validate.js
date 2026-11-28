import { validationError } from '../utils/errors.js'

/**
 * Validate body, query and params with zod schemas. Parsed values go to `req.valid`
 * (Express 5 makes req.query read-only), and unknown body keys are dropped.
 */
export function validate(schemas) {
  return (req, _res, next) => {
    const valid = {}
    const issues = []
    for (const part of ['params', 'query', 'body']) {
      if (!schemas[part]) continue
      const r = schemas[part].safeParse(req[part] ?? {})
      if (r.success) valid[part] = r.data
      else issues.push(...r.error.issues.map((i) => ({ in: part, path: i.path.join('.'), message: i.message })))
    }
    if (issues.length) return next(validationError(issues))
    req.valid = valid
    next()
  }
}
