import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { env } from '../../config/env.js'
import { notFound } from '../../utils/errors.js'

/**
 * Private files (advocate documents incl. Aadhaar, profile photos, later chat attachments).
 * Each file is encrypted with AES-256-GCM before it touches the disk:
 *   [12-byte IV][16-byte auth tag][ciphertext]
 * Files are never served statically: only API endpoints that check ownership or admin
 * rights read them. Stored names are random, so a path reveals nothing.
 */
const root = () => path.resolve(env.UPLOAD_DIR, 'private')
const key = () => Buffer.from(env.FILES_ENC_KEY, 'base64')

function resolveSafe(rel) {
  const full = path.resolve(root(), rel)
  if (!full.startsWith(root() + path.sep)) throw notFound('File')
  return full
}

export async function savePrivate(buffer, folder) {
  if (!/^[a-f0-9]{24}$/.test(folder)) throw new Error('savePrivate: folder must be an object id')
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(buffer), cipher.final()])
  const out = Buffer.concat([iv, cipher.getAuthTag(), data])
  const rel = folder + '/' + crypto.randomBytes(16).toString('hex') + '.bin'
  const full = resolveSafe(rel)
  await fs.mkdir(path.dirname(full), { recursive: true })
  await fs.writeFile(full, out, { flag: 'wx' })
  return { path: rel, size: buffer.length, sha256: crypto.createHash('sha256').update(buffer).digest('hex') }
}

export async function readPrivate(rel) {
  let raw
  try {
    raw = await fs.readFile(resolveSafe(rel))
  } catch {
    throw notFound('File')
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), raw.subarray(0, 12))
  decipher.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()])
}

export async function removePrivate(rel) {
  if (!rel) return
  await fs.rm(resolveSafe(rel), { force: true })
}

/** Send a private file to an already-authorised caller. Never cached by browsers or proxies. */
export async function sendPrivate(res, file) {
  const buf = await readPrivate(file.path)
  res.set({ 'Content-Type': file.mime, 'Content-Length': String(buf.length), 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Disposition': 'inline' })
  res.end(buf)
}
