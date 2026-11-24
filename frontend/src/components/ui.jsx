/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Check, Loader2, User, X } from 'lucide-react'
import { IMG, PHOTOS } from '@/lib/catalog'

const cx = (...a) => a.filter(Boolean).join(' ')
export { cx }

/* ---------------- buttons ---------------- */

const BTN = {
  gold: 'bg-gold text-ink hover:bg-gold-dark',
  ink: 'bg-ink text-white hover:bg-ink-2',
  line: 'bg-white text-text border border-line-strong hover:bg-page',
  ghost: 'text-gold-text hover:bg-gold-tint',
  danger: 'bg-white text-red border border-[#f3c7c2] hover:bg-red-soft',
  green: 'bg-green text-white hover:brightness-95',
}

export function Button({ variant = 'gold', size = 'md', icon: Icon, loading, className, children, ...rest }) {
  const sz = size === 'sm' ? 'h-9 px-3 text-[13px] rounded-[10px]' : size === 'lg' ? 'h-[52px] px-6 text-[16px] rounded-xl' : 'h-11 px-4 text-[14px] rounded-xl'
  return (
    <button
      {...rest}
      disabled={rest.disabled || loading}
      className={cx('inline-flex items-center justify-center gap-2 font-semibold transition disabled:opacity-100 disabled:bg-surface-2 disabled:text-faint disabled:border-transparent disabled:cursor-not-allowed', sz, BTN[variant], className)}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : Icon ? <Icon className="size-[18px]" /> : null}
      {children}
    </button>
  )
}

/* ---------------- status ---------------- */

const TONE = {
  neutral: 'bg-surface-2 text-[#4A4740]',
  gold: 'bg-gold-tint text-gold-text',
  green: 'bg-green-soft text-green',
  orange: 'bg-orange-soft text-orange',
  red: 'bg-red-soft text-red',
  blue: 'bg-blue-soft text-blue',
  ink: 'bg-ink text-gold',
}
const DOT = { neutral: 'bg-muted', gold: 'bg-gold', green: 'bg-green', orange: 'bg-orange', red: 'bg-red', blue: 'bg-blue', ink: 'bg-gold' }

export function Pill({ tone = 'neutral', dot = true, children, className }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[12px] font-semibold whitespace-nowrap', TONE[tone], className)}>
      {dot ? <span className={cx('size-1.5 rounded-full', DOT[tone])} /> : null}
      {children}
    </span>
  )
}

export const REQ_STATUS = {
  submitted: { label: 'Finding advocate', tone: 'neutral' },
  assigned: { label: 'Advocate assigned', tone: 'blue' },
  accepted: { label: 'Advocate assigned', tone: 'blue' },
  quoted: { label: 'Quote received', tone: 'gold' },
  paid: { label: 'In progress', tone: 'green' },
  done: { label: 'Confirm completion', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  disputed: { label: 'Disputed', tone: 'red' },
}
export const CASE_STATUS = {
  assigned: { label: 'New request', tone: 'gold' },
  accepted: { label: 'Send a quote', tone: 'blue' },
  quoted: { label: 'Quote sent', tone: 'gold' },
  paid: { label: 'Paid · in progress', tone: 'green' },
  done: { label: 'Awaiting confirmation', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  disputed: { label: 'Disputed', tone: 'red' },
}
export const ADMIN_REQ_STATUS = {
  submitted: { label: 'Unassigned', tone: 'neutral' },
  assigned: { label: 'Waiting for advocate', tone: 'blue' },
  accepted: { label: 'Accepted', tone: 'blue' },
  quoted: { label: 'Quote sent', tone: 'gold' },
  paid: { label: 'Paid · in progress', tone: 'green' },
  done: { label: 'Awaiting confirmation', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  disputed: { label: 'Disputed', tone: 'red' },
}
export const ADV_STATUS = {
  none: { label: 'Registering', tone: 'neutral' },
  pending: { label: 'Pending review', tone: 'orange' },
  reupload: { label: 'Retake asked', tone: 'orange' },
  approved: { label: 'Verified', tone: 'green' },
  rejected: { label: 'Rejected', tone: 'red' },
}

export function CategoryTag({ cat }) {
  return (
    <span className="inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold whitespace-nowrap" style={{ background: cat.tone.bg, color: cat.tone.fg }}>
      {cat.short}
    </span>
  )
}

/* ---------------- inputs ---------------- */

export function Field({ label, hint, error, prefix, as = 'input', className, children, ...rest }) {
  const Tag = as
  return (
    <label className={cx('flex flex-col gap-1.5', className)}>
      {label ? <span className="text-[13px] font-semibold text-text-2">{label}</span> : null}
      <span className={cx('flex items-stretch rounded-xl border bg-white overflow-hidden focus-within:border-ink focus-within:ring-1 focus-within:ring-ink', error ? 'border-red' : 'border-line-strong')}>
        {prefix ? <span className="flex items-center px-3 border-r border-line font-bold text-[15px]">{prefix}</span> : null}
        {children ?? (
          <Tag
            {...rest}
            className={cx('flex-1 min-w-0 bg-transparent px-3.5 outline-none text-[15px] placeholder:text-faint', as === 'textarea' ? 'py-3 min-h-[120px] resize-y' : 'h-[46px]')}
          />
        )}
      </span>
      {error ? <span className="text-[12px] text-red">{error}</span> : hint ? <span className="text-[12px] text-muted">{hint}</span> : null}
    </label>
  )
}

export function Select({ label, options, className, ...rest }) {
  return (
    <Field label={label} className={className}>
      <select {...rest} className="flex-1 h-[46px] bg-transparent px-3 outline-none text-[15px]">
        {options.map((o) => (typeof o === 'string' ? <option key={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Field>
  )
}

export function Chip({ active, children, ...rest }) {
  return (
    <button type="button" {...rest} aria-pressed={!!active} className={cx('h-9 px-3.5 rounded-full text-[13px] font-semibold border transition', active ? 'bg-ink text-white border-ink' : 'bg-white text-text border-line-strong hover:border-ink')}>
      {children}
    </button>
  )
}

export function Toggle({ checked, onChange, label }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className={cx('relative h-7 w-12 rounded-full transition shrink-0', checked ? 'bg-ink' : 'bg-line-strong')}>
      <span className={cx('absolute top-[3px] size-[22px] rounded-full bg-white transition-all', checked ? 'left-[23px]' : 'left-[3px]')} />
    </button>
  )
}

export function CheckBox({ checked }) {
  return <span className={cx('grid size-[22px] place-items-center rounded-md shrink-0', checked ? 'bg-gold' : 'border-[1.5px] border-[#B8B0A0] bg-white')}>{checked ? <Check className="size-3.5 text-ink" strokeWidth={3} /> : null}</span>
}

export function Radio({ checked }) {
  return (
    <span className={cx('grid size-6 place-items-center rounded-full border-2 bg-white shrink-0', checked ? 'border-ink' : 'border-[#B8B0A0]')}>
      {checked ? <span className="size-3 rounded-full bg-gold" /> : null}
    </span>
  )
}

/* ---------------- layout bits ---------------- */

export function Card({ className, children, ...rest }) {
  return (
    <div {...rest} className={cx('card', className)}>
      {children}
    </div>
  )
}

export function SectionTitle({ title, action, onAction, className }) {
  return (
    <div className={cx('flex items-center justify-between gap-3', className)}>
      <h2 className="text-[17px] font-bold">{title}</h2>
      {action ? (
        <button onClick={onAction} className="text-[13px] font-semibold text-gold-text hover:underline">
          {action}
        </button>
      ) : null}
    </div>
  )
}

export function BillRow({ label, value, strong, tone }) {
  return (
    <div className={cx('flex justify-between gap-3', strong ? 'text-[16px] font-extrabold text-ink' : 'text-[14px] font-medium text-text-2', tone === 'green' && 'text-green')}>
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  )
}

export function Note({ tone = 'green', icon: Icon, children, className }) {
  const t = { green: 'bg-green-soft text-green-text', gold: 'bg-gold-tint text-gold-text', orange: 'bg-[#FDF3EA] text-[#7A3304]', neutral: 'bg-surface-2 text-text-2' }[tone]
  return (
    <div className={cx('flex gap-2.5 rounded-xl p-3 text-[13px] leading-relaxed font-medium', t, className)}>
      {Icon ? <Icon className="size-[18px] shrink-0 mt-px" /> : null}
      <div>{children}</div>
    </div>
  )
}

export function EmptyState({ icon: Icon, title, sub, action, onAction }) {
  return (
    <div className="flex flex-col items-center text-center gap-2.5 py-12 px-6">
      {Icon ? (
        <span className="grid size-16 place-items-center rounded-2xl bg-ink mb-1">
          <Icon className="size-7 text-gold" />
        </span>
      ) : null}
      <p className="text-[17px] font-bold">{title}</p>
      {sub ? <p className="text-[14px] text-muted max-w-md">{sub}</p> : null}
      {action ? (
        <Button size="sm" onClick={onAction} className="mt-2">
          {action}
        </Button>
      ) : null}
    </div>
  )
}

export function Timeline({ steps }) {
  return (
    <ol>
      {steps.map((s, i) => {
        const last = i === steps.length - 1
        return (
          <li key={s.title} className="flex gap-3">
            <div className="flex w-6 flex-col items-center">
              <span
                className={cx(
                  'grid size-6 place-items-center rounded-full shrink-0',
                  s.state === 'done' && 'bg-green',
                  s.state === 'now' && 'bg-gold ring-4 ring-gold-tint',
                  s.state === 'todo' && 'bg-white border-2 border-line-strong',
                )}>
                {s.state === 'done' ? <Check className="size-3.5 text-white" strokeWidth={3} /> : null}
              </span>
              {!last ? <span className={cx('w-0.5 flex-1 min-h-4', s.state === 'done' ? 'bg-green' : 'bg-line')} /> : null}
            </div>
            <div className={cx('flex-1', !last && 'pb-3.5')}>
              <p className={cx('text-[14px] font-bold', s.state === 'todo' && 'text-muted')}>{s.title}</p>
              {s.sub ? <p className={cx('text-[12px] font-medium mt-0.5', s.state === 'now' ? 'text-orange' : 'text-muted')}>{s.sub}</p> : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

export function Avatar({ photo, size = 40, ring, className }) {
  const src = !photo ? null : photo.startsWith?.('data:') || photo.startsWith?.('/') || photo.startsWith?.('http') ? photo : PHOTOS[photo]
  return src ? (
    <img src={src} alt="" className={cx('rounded-full object-cover shrink-0 bg-surface-2', ring && 'ring-2 ring-gold', className)} style={{ width: size, height: size }} />
  ) : (
    <span className={cx('grid place-items-center rounded-full bg-surface-2 shrink-0', ring && 'ring-2 ring-gold', className)} style={{ width: size, height: size }}>
      <User className="text-[#4A4740]" style={{ width: size * 0.47, height: size * 0.47 }} />
    </span>
  )
}

/** Stand-in for a sample document image (seeded advocates). */
export function DocImage({ src, title, className }) {
  if (src && src !== 'sample') return <img src={src} alt={title} className={cx('object-contain bg-ink', className)} />
  return (
    <div className={cx('bg-[#F4EEDD] border-2 border-[#7A5A0E] p-[6%] flex flex-col gap-[5%] overflow-hidden', className)}>
      <span className="text-[10px] font-bold text-red tracking-wide">SAMPLE DOCUMENT</span>
      <span className="text-[12px] font-bold text-text leading-tight">{title}</span>
      {[90, 75, 82, 60].map((w) => (
        <span key={w} className="h-1.5 rounded bg-[#D8CDB0]" style={{ width: w + '%' }} />
      ))}
    </div>
  )
}

export function Wordmark({ dark = true, className = 'h-7' }) {
  return <img src={dark ? IMG.wordmarkWhite : IMG.wordmarkInk} alt="Vakeel Bhai" className={cx('w-auto', className)} />
}

/* ---------------- overlays ---------------- */

export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return
    const k = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cx('w-full bg-white rounded-t-2xl sm:rounded-2xl shadow-pop max-h-[92vh] flex flex-col', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h3 className="text-[17px] font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg hover:bg-page">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto thin-scroll px-5 py-4 flex flex-col gap-4">{children}</div>
        {footer ? <div className="border-t border-line px-5 py-3 flex flex-wrap justify-end gap-2">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Drawer({ open, onClose, title, children, footer }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-ink/40" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <aside role="dialog" aria-modal="true" aria-label={title} className="h-full w-full max-w-[480px] bg-white shadow-pop flex flex-col">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line">
          <h3 className="text-[17px] font-bold">{title}</h3>
          <button onClick={onClose} aria-label="Close" className="grid size-9 place-items-center rounded-lg hover:bg-page">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto thin-scroll p-5 flex flex-col gap-4">{children}</div>
        {footer ? <div className="border-t border-line p-4 flex gap-2">{footer}</div> : null}
      </aside>
    </div>
  )
}

const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const toast = useCallback((text, tone = 'ink') => {
    const id = Math.random()
    setItems((x) => [...x, { id, text, tone }])
    setTimeout(() => setItems((x) => x.filter((i) => i.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 items-center pointer-events-none" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={cx('rounded-xl px-4 py-2.5 text-[14px] font-semibold shadow-pop', t.tone === 'green' ? 'bg-green text-white' : t.tone === 'red' ? 'bg-red text-white' : 'bg-ink text-white')}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function PageLoader() {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <Loader2 className="size-7 animate-spin text-gold" />
    </div>
  )
}

/** Simple table with a scroll box (admin and portals). */
export function Table({ head, rows, empty = 'Nothing here yet', onRow, rowKey }) {
  return (
    <div className="card overflow-x-auto thin-scroll">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3.5 py-2.5 text-[12px] font-semibold text-muted border-b border-line whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-[14px] text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((r, i) => (
              <tr key={rowKey ? rowKey(r, i) : i} onClick={onRow ? () => onRow(r, i) : undefined} className={cx('border-b border-line-soft last:border-0', onRow && 'cursor-pointer hover:bg-gold-wash')}>
                {r.cells.map((c, k) => (
                  <td key={k} className="px-3.5 py-3 text-[13.5px] whitespace-nowrap align-middle">
                    {c}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

export function Stat({ label, value, sub, onClick }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag onClick={onClick} className={cx('card p-4 text-left flex flex-col gap-1', onClick && 'hover:border-line-strong')}>
      <span className="text-[12px] font-medium text-muted">{label}</span>
      <span className="text-[22px] font-extrabold tabular-nums">{value}</span>
      {sub ? <span className="text-[12px] text-muted">{sub}</span> : null}
    </Tag>
  )
}
