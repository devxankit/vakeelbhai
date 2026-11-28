import { AuditLog } from './auditLog.model.js'

/** Record an admin action. `req.auth` must be an admin. Pass a session for transactional writes. */
export async function audit(req, { action, entityType, entityId, before, after, note }, session) {
  const doc = {
    actor: req.auth?.id,
    actorEmail: req.auth?.admin?.email,
    action,
    entityType,
    entityId: entityId != null ? String(entityId) : undefined,
    before,
    after,
    note,
    ip: req.ip,
  }
  await AuditLog.create([doc], session ? { session } : undefined)
}

/** Only the fields that changed, for before/after records. */
export function diff(before, after) {
  const b = {}
  const a = {}
  for (const k of Object.keys(after)) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after[k])) {
      b[k] = before?.[k] ?? null
      a[k] = after[k]
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 }
}
