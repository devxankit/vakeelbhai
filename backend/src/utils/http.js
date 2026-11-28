/**
 * Response shape used by every endpoint:
 *   success: { success: true, data, meta? }
 *   failure: { success: false, error: { code, message, details? } }   (see middleware/error.js)
 */
export const ok = (res, data, meta) => res.json(meta ? { success: true, data, meta } : { success: true, data })
export const created = (res, data) => res.status(201).json({ success: true, data })

/** Page and limit from an already-validated query. */
export function pageArgs(q) {
  const page = Math.max(1, q.page ?? 1)
  const limit = Math.min(100, Math.max(1, q.limit ?? 20))
  return { page, limit, skip: (page - 1) * limit }
}

export const pageMeta = ({ page, limit }, total) => ({ page, limit, total, pages: Math.ceil(total / limit) })

/** Escape user text before using it in a RegExp search. */
export const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
