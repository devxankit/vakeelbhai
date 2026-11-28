import { useCallback, useEffect, useRef, useState } from 'react'
import { FileText, Lock, Paperclip, Send } from 'lucide-react'
import { Button, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import { errText, uploadForm, userApi, userFileUrl } from '@/lib/api'
import { useLive } from '@/lib/live'
import { inr } from '@/lib/money'
import { dateShort, time } from '@/lib/format'

/**
 * Private chat on a request, for the client and the advocate. Same as the app's Chat screen
 * (mobile-app/src/screens/shared.tsx): system notes, bubbles, quote cards, photos, and
 * "Phone numbers are never shared". Messages come from the API and arrive live.
 *
 * side: 'client' | 'advocate' · status: the side's own status vocabulary
 */
const PAID = ['paid', 'done', 'completed', 'disputed']

export default function LiveChat({ number, side, status, onPay, onQuote, headerSlot, closed }) {
  const toast = useToast()
  const [msgs, setMsgs] = useState(null)
  const [error, setError] = useState('')
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const end = useRef(null)
  const base = '/requests/' + number + '/messages'

  const load = useCallback(async () => {
    try {
      setMsgs((await userApi(base)).data)
      setError('')
    } catch (e) {
      setError(errText(e))
    }
  }, [base])

  useEffect(() => {
    load()
  }, [load])

  useLive('user', {
    message: (p) => {
      if (p.number !== number) return
      setMsgs((list) => (list && !list.some((m) => m.id === p.message.id) ? [...list, p.message] : list))
    },
    reconnect: load,
  })

  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length])

  const add = (m) => setMsgs((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]))
  const send = async () => {
    const t = text.trim()
    if (!t || sending) return
    setSending(true)
    try {
      add((await userApi(base, { method: 'POST', body: { text: t } })).data)
      setText('')
    } catch (e) {
      toast(errText(e), 'red')
    } finally {
      setSending(false)
    }
  }
  const sendImage = async (e) => {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    if (!/^image\/(jpeg|png|webp)$/.test(f.type) || f.size > 5 * 1024 * 1024) return toast('Choose a JPG, PNG or WebP photo up to 5 MB', 'red')
    setSending(true)
    try {
      add((await userApi(base + '/image', { method: 'POST', body: uploadForm(f) })).data)
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setSending(false)
    }
  }

  const quoteNote = side === 'advocate' ? (status === 'quoted' ? 'Waiting for the client to pay' : 'Paid by the client') : PAID.includes(status) ? 'Paid' : 'GST and offers shown at checkout'

  return (
    <div className="card overflow-hidden flex flex-col h-[600px] max-h-[78vh]">
      {headerSlot}
      <div className="flex-1 overflow-y-auto thin-scroll bg-chat p-4 flex flex-col gap-2">
        <p className="self-center flex items-center gap-1.5 text-[12px] font-medium text-[#5F5B53] mb-1">
          <Lock className="size-3.5" /> Private chat. Phone numbers are never shared.
        </p>
        {error ? <p className="self-center text-[13px] text-muted py-6">{error}</p> : null}
        {msgs === null && !error ? <p className="self-center text-[13px] text-muted py-6">Loading…</p> : null}
        {(msgs ?? []).map((m) => {
          if (m.from === 'system')
            return (
              <p key={m.id} className="self-center text-center max-w-[92%] rounded-full bg-[#E9E5DC] px-3 py-1.5 text-[12px] font-semibold text-[#5F5B53]">
                {m.text}
              </p>
            )
          const mine = m.from === side
          if (m.kind === 'quote')
            return (
              <div key={m.id} className={cx('w-[290px] max-w-full rounded-2xl border-[1.5px] border-ink bg-white overflow-hidden', mine ? 'self-end' : 'self-start')}>
                <div className="bg-ink px-3.5 py-2.5 flex justify-between">
                  <span className="text-[13px] font-bold text-gold">Fee quote</span>
                  <span className="text-[11px] text-on-ink-muted">Valid till {dateShort(new Date(m.quote.validTill).getTime())}</span>
                </div>
                <div className="p-3.5 flex flex-col gap-2.5">
                  <p className="text-[26px] font-extrabold">{inr(m.quote.fee)}</p>
                  <p className="text-[13px] leading-relaxed text-text-2">{m.quote.scope}</p>
                  <span className="h-px bg-line" />
                  {side === 'client' && status === 'quoted' && onPay ? (
                    <Button size="sm" onClick={onPay}>
                      Accept and pay
                    </Button>
                  ) : (
                    <p className="text-[12px] font-semibold text-muted">{quoteNote}</p>
                  )}
                </div>
              </div>
            )
          return (
            <div key={m.id} className={cx('max-w-[80%]', mine ? 'self-end' : 'self-start')}>
              <div className={cx('text-[14px] leading-relaxed', m.kind === 'image' ? 'p-1' : 'px-3 py-2', mine ? 'bg-ink text-white rounded-2xl rounded-tr-md' : 'bg-white border border-line rounded-2xl rounded-tl-md')}>
                {m.kind === 'image' ? <SecureImage load={userFileUrl} path={'/requests/' + number + '/messages/' + m.id + '/file'} alt="Shared photo" className="size-[200px] rounded-[11px] object-cover" /> : null}
                {m.text}
              </div>
              <p className={cx('text-[10.5px] text-[#8A857A] mt-0.5', mine && 'text-right')}>{time(new Date(m.at).getTime()) + (mine ? ' · Sent' : '')}</p>
            </div>
          )
        })}
        <div ref={end} />
      </div>
      {closed ? (
        <p className="border-t border-line p-4 text-center text-[13px] text-muted bg-white">This case is closed. Contact support if you need help.</p>
      ) : (
        <form
          className="border-t border-line p-3 flex items-end gap-2 bg-white"
          onSubmit={(e) => {
            e.preventDefault()
            send()
          }}>
          <label className="grid size-11 place-items-center rounded-xl hover:bg-chat cursor-pointer shrink-0" aria-label="Attach a photo">
            <Paperclip className="size-5" />
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={sendImage} disabled={sending} />
          </label>
          {onQuote ? (
            <button type="button" onClick={onQuote} aria-label="Send quote" className="grid size-11 place-items-center rounded-xl hover:bg-chat shrink-0">
              <FileText className="size-5" />
            </button>
          ) : null}
          <textarea
            rows={1}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            maxLength={2000}
            placeholder="Type a message"
            aria-label="Message"
            className="flex-1 min-h-11 max-h-32 resize-none rounded-[22px] border border-line-strong px-4 py-2.5 text-[14px] outline-none focus:border-ink"
          />
          <button type="submit" disabled={!text.trim() || sending} aria-label="Send" className="grid size-11 place-items-center rounded-full bg-ink text-gold disabled:bg-surface-2 disabled:text-faint shrink-0">
            <Send className="size-5" />
          </button>
        </form>
      )}
    </div>
  )
}
