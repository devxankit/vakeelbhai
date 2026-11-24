const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const DAY = 24 * 60 * 60 * 1000

export function dateShort(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  return d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear()
}

export function time(ts) {
  const d = new Date(ts)
  const h = d.getHours()
  return (h % 12 || 12) + ':' + String(d.getMinutes()).padStart(2, '0') + (h < 12 ? ' am' : ' pm')
}

export function ago(ts, now = Date.now()) {
  const s = Math.max(0, Math.round((now - ts) / 1000))
  if (s < 60) return 'just now'
  const m = Math.round(s / 60)
  if (m < 60) return m + ' min ago'
  const h = Math.round(m / 60)
  if (h < 24) return h + ' h ago'
  const d = Math.round(h / 24)
  if (d < 8) return d + ' d ago'
  return dateShort(ts)
}

export function phonePretty(p = '') {
  const d = String(p).replace(/\D/g, '').slice(-10)
  return d.length === 10 ? d.slice(0, 5) + ' ' + d.slice(5) : d
}

export function addMonths(ts, months) {
  const d = new Date(ts)
  d.setMonth(d.getMonth() + months)
  return d.getTime()
}

/** Download rows as a CSV file (admin reports). */
export function downloadCsv(name, rows) {
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"'
  const csv = rows.map((r) => r.map(esc).join(',')).join('\n')
  const url = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useTitle(title, description) {
  // Small SEO helper: per-page <title> and meta description.
  if (typeof document === 'undefined') return
  document.title = title ? title + ' · Vakeel Bhai' : 'Vakeel Bhai: legal help from verified advocates'
  if (description) {
    let m = document.querySelector('meta[name="description"]')
    if (m) m.setAttribute('content', description)
  }
}
