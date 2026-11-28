import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Camera, Check, Clock, FileCheck, IdCard, Image as ImageIcon, LogOut, MessageCircle, Pencil, RotateCcw, ShieldCheck, TriangleAlert, XCircle } from 'lucide-react'
import { Button, Card, Field, Note, PageLoader, Pill, Radio, Select, Timeline, Wordmark, cx, useToast } from '@/components/ui'
import SecureImage from '@/components/SecureImage'
import AdvocateArea from './AdvocateArea'
import { CATEGORIES, DISTRICTS, DOC_STEPS, IMG, STATES } from '@/lib/catalog'
import { errText, publicApi, refreshUser, uploadForm, userApi, userFileUrl, userSession } from '@/lib/api'
import { closeLive } from '@/lib/live'
import { useGatewayPay } from '@/lib/pay'
import { dateShort, phonePretty, useTitle } from '@/lib/format'
import { inr } from '@/lib/money'

/**
 * Advocate area of the website. SAME FLOW AS THE APP (mobile-app/src/screens/advocate.tsx):
 *   1 Your details (+ profile photo) → 2 Your practice → 3–7 one document per screen
 *   → 8 Review and submit → status screen (in progress / retake / verified) → Membership.
 * Data comes from the real API. Buying a plan arrives with the payments module.
 */

const TOTAL_STEPS = 8
const MAX_MB = 5
const CAT_IMG = Object.fromEntries(CATEGORIES.map((c) => [c.key, c.image]))

export default function AdvocatePortal() {
  const loc = useLocation()
  const [me, setMe] = useState(undefined) // undefined: checking · null: signed out
  const [meta, setMeta] = useState(null)
  const [error, setError] = useState('')
  useTitle('Advocate')

  const load = useCallback(async () => {
    setError('')
    try {
      const [p, m] = await Promise.all([userApi('/advocate/profile'), publicApi('/meta')])
      setMeta(m.data)
      setMe(p.data)
    } catch (e) {
      if (e.status === 401 || e.status === 403) setMe(null)
      else setError(errText(e))
    }
  }, [])

  useEffect(() => {
    userSession.onSignedOut(() => setMe(null))
    refreshUser()
      .then((d) => (d.user?.role === 'advocate' ? load() : setMe(null)))
      .catch(() => setMe(null))
  }, [load])

  const logout = async () => {
    try {
      await userApi('/auth/logout', { method: 'POST' })
    } catch {
      /* already gone */
    }
    userSession.clear()
    closeLive('user')
    setMe(null)
  }

  if (me === null) return <Navigate to={'/login?role=advocate&next=' + encodeURIComponent(loc.pathname + loc.search)} replace />
  if (error)
    return (
      <Shell onLogout={logout}>
        <Card className="p-6 flex flex-col items-start gap-3">
          <p className="font-bold">Could not load your account</p>
          <p className="text-[14px] text-muted">{error}</p>
          <Button size="sm" variant="line" onClick={load}>
            Try again
          </Button>
        </Card>
      </Shell>
    )
  if (me === undefined || !meta) return <PageLoader />
  // Verified with an active membership: the app's main tabs (AdvTabs).
  if (me.verification.status === 'approved' && me.membership?.active) return <AdvocateArea me={me} meta={meta} onLogout={logout} onRefresh={load} />

  return (
    <Shell me={me} onLogout={logout}>
      {me.verification.status === 'draft' ? <Registration me={me} meta={meta} setMe={setMe} /> : <AfterSubmit me={me} meta={meta} setMe={setMe} onRefresh={load} />}
    </Shell>
  )
}

/* ---------------- shell ---------------- */

function Shell({ me, onLogout, children }) {
  return (
    <div className="min-h-screen bg-page flex flex-col">
      <header className="bg-ink">
        <div className="wrap flex items-center gap-3 h-16">
          <Link to="/">
            <Wordmark className="h-8" />
          </Link>
          <span className="rounded-md bg-ink-line px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gold">Advocate</span>
          <div className="ml-auto flex items-center gap-3">
            {me?.user?.name ? <span className="hidden sm:block text-[13px] font-semibold text-white">Adv. {me.user.name}</span> : null}
            <button onClick={onLogout} aria-label="Log out" className="grid size-10 place-items-center rounded-lg text-white hover:bg-ink-2">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>
      <main className="flex-1 w-full max-w-[640px] mx-auto p-4 sm:p-6">{children}</main>
    </div>
  )
}

/** The app's StepHeader: "Verification · Step n of 8", progress segments, title, help. */
function StepHeader({ step, title, sub, onBack, support }) {
  return (
    <div className="bg-ink rounded-2xl px-4 pt-3 pb-5 text-white">
      <div className="flex items-center min-h-11">
        {onBack ? (
          <button onClick={onBack} aria-label="Back" className="grid size-10 place-items-center rounded-lg hover:bg-ink-2">
            <ArrowLeft className="size-5" />
          </button>
        ) : (
          <span className="w-3" />
        )}
        <span className="flex-1 text-[13px] font-semibold text-on-ink-muted">Verification · Step {step} of {TOTAL_STEPS}</span>
        <WhatsAppLink wa={support} topic="Advocate verification" className="px-2 text-[13px] font-semibold text-gold">
          Help
        </WhatsAppLink>
      </div>
      <div className="flex gap-1 pl-3 mt-1.5">
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span key={i} className={cx('flex-1 h-1 rounded-sm', i < step - 1 ? 'bg-white' : i === step - 1 ? 'bg-gold' : 'bg-ink-border')} />
        ))}
      </div>
      <div className="pl-3 mt-2.5">
        <h1 className="font-serif font-bold text-[20px]">{title}</h1>
        {sub ? <p className="text-[13.5px] text-on-ink-muted mt-1 leading-relaxed">{sub}</p> : null}
      </div>
    </div>
  )
}

function WhatsAppLink({ wa, topic, className, children }) {
  if (!wa)
    return (
      <Link to="/contact" className={className}>
        {children}
      </Link>
    )
  return (
    <a href={'https://wa.me/' + wa + '?text=' + encodeURIComponent('Hello Vakeel Bhai, I need help with: ' + topic)} target="_blank" rel="noreferrer" className={className}>
      {children}
    </a>
  )
}

/** The app's BottomBar: actions under the content. */
function BottomBar({ children, hint }) {
  return (
    <div className="flex flex-col gap-2 mt-5">
      {children}
      {hint ? <p className="text-center text-[12px] text-muted">{hint}</p> : null}
    </div>
  )
}

/* ---------------- registration: steps 1 to 8 ---------------- */

function Registration({ me, meta, setMe }) {
  // step: 1 details · 2 practice · 3..7 documents · 8 review
  const [step, setStep] = useState(() => {
    const m = me.missing
    if (m.some((x) => ['name', 'email', 'address', 'state', 'district', 'photo'].includes(x))) return 1
    if (m.some((x) => ['practice', 'experienceYears', 'courts', 'enrolmentNumber'].includes(x))) return 2
    const firstDoc = me.documents.findIndex((d) => d.status === 'missing')
    return firstDoc >= 0 ? 3 + firstDoc : 8
  })
  const back = step > 1 ? () => setStep(step - 1) : undefined
  const wa = meta.supportWhatsApp
  if (step === 1) return <DetailsStep me={me} setMe={setMe} wa={wa} onNext={() => setStep(2)} />
  if (step === 2) return <PracticeStep me={me} meta={meta} setMe={setMe} wa={wa} onBack={back} onNext={() => setStep(3)} />
  if (step <= 7) return <DocStep key={step} i={step - 3} me={me} setMe={setMe} wa={wa} onBack={back} onNext={() => setStep(step + 1)} />
  return <ReviewStep me={me} meta={meta} setMe={setMe} wa={wa} onBack={back} goTo={setStep} />
}

/** Hidden file inputs for "Take photo" (camera on phones) and "Choose from gallery", with validation and upload. */
function useImagePick(path, onDone) {
  const camRef = useRef(null)
  const galRef = useRef(null)
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const onChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return toast('Choose a JPG, PNG or WebP photo', 'red')
    if (file.size > MAX_MB * 1024 * 1024) return toast('The photo must be ' + MAX_MB + ' MB or smaller', 'red')
    setBusy(true)
    try {
      onDone((await userApi(path, { method: 'PUT', body: uploadForm(file) })).data)
    } catch (err) {
      toast(errText(err), 'red')
    } finally {
      setBusy(false)
    }
  }
  const inputs = (
    <>
      <input ref={camRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" className="sr-only" onChange={onChange} />
      <input ref={galRef} type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={onChange} />
    </>
  )
  return { busy, takePhoto: () => camRef.current?.click(), choosePhoto: () => galRef.current?.click(), inputs }
}

function useSave(setMe) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const save = async (body, then) => {
    setBusy(true)
    setError('')
    try {
      setMe((await userApi('/advocate/profile', { method: 'PATCH', body })).data)
      then?.()
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, save }
}

/* 1. details + profile photo */
function DetailsStep({ me, setMe, wa, onNext }) {
  const [f, setF] = useState({ name: me.user.name, email: me.user.email, address: me.address, state: me.state || 'Madhya Pradesh', district: me.district || 'Indore' })
  const [photoV, setPhotoV] = useState(0)
  const { busy, error, save } = useSave(setMe)
  const pic = useImagePick('/advocate/photo', (d) => (setMe(d), setPhotoV((v) => v + 1)))
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  const ok = f.name.trim().length >= 3 && /\S+@\S+\.\S+/.test(f.email) && f.address.trim().length >= 5 && me.hasPhoto
  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={1} title="Your details" sub="As written on your Bar Council enrolment" support={wa} />
      <div className="flex flex-col items-center gap-2.5 py-2">
        <button onClick={pic.takePhoto} aria-label="Take profile photo" className={cx('grid size-[104px] place-items-center rounded-full bg-white overflow-hidden border-2', me.hasPhoto ? 'border-gold' : 'border-dashed border-line-strong')}>
          {me.hasPhoto ? <SecureImage load={userFileUrl} path="/advocate/photo" version={photoV} alt="Your photo" className="size-[100px] object-cover" /> : pic.busy ? <span className="text-[12px] text-muted">Uploading…</span> : <Camera className="size-[30px] text-muted" />}
        </button>
        <div className="flex gap-4">
          <button onClick={pic.takePhoto} className="text-[13px] font-semibold text-gold-text">
            {me.hasPhoto ? 'Retake selfie' : 'Take a selfie'}
          </button>
          <button onClick={pic.choosePhoto} className="text-[13px] font-semibold text-gold-text">
            Choose photo
          </button>
        </div>
        <p className="text-[12px] text-muted">Clients see this photo after you accept their request</p>
        {pic.inputs}
      </div>
      <Field label="Full name" value={f.name} onChange={set('name')} maxLength={80} placeholder="e.g. Rohan Malhotra" autoComplete="name" />
      <Field label="Email" type="email" value={f.email} onChange={set('email')} maxLength={120} placeholder="name@example.com" autoComplete="email" />
      <Field label="Address" value={f.address} onChange={set('address')} maxLength={300} placeholder="Chamber or office address" />
      <div className="grid grid-cols-2 gap-3">
        <Select label="State" value={f.state} onChange={set('state')} options={STATES} />
        <Select label="District" value={f.district} onChange={set('district')} options={DISTRICTS} />
      </div>
      <p className="text-[12px] text-muted">Mobile: +91 {phonePretty(me.user.phone)}</p>
      {error ? <Note tone="orange">{error}</Note> : null}
      <BottomBar hint={!me.hasPhoto ? 'Add a profile photo to continue' : undefined}>
        <Button size="lg" loading={busy} disabled={!ok} onClick={() => save({ ...f, name: f.name.trim().replace(/^adv\.?\s*/i, '') }, onNext)}>
          Next
        </Button>
      </BottomBar>
    </div>
  )
}

/* 2. practice */
function PracticeStep({ me, meta, setMe, wa, onBack, onNext }) {
  const [practice, setPractice] = useState(me.practice)
  const [years, setYears] = useState(me.experienceYears == null ? '' : String(me.experienceYears))
  const [courts, setCourts] = useState(me.courts || (me.district ? me.district + ' District Court' : ''))
  const [enrol, setEnrol] = useState(me.enrolmentNumber)
  const { busy, error, save } = useSave(setMe)
  const ok = practice.length > 0 && /^\d{1,2}$/.test(years) && courts.trim().length > 2 && enrol.trim().length >= 5
  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={2} title="Your practice" sub="We send you requests from these areas only" onBack={onBack} support={wa} />
      <p className="text-[13px] font-semibold text-text-2">Practice areas (pick one or more)</p>
      <div className="grid grid-cols-2 gap-2.5">
        {meta.categories.map((c) => {
          const on = practice.includes(c.key)
          return (
            <button
              key={c.key}
              role="checkbox"
              aria-checked={on}
              onClick={() => setPractice(on ? practice.filter((x) => x !== c.key) : [...practice, c.key])}
              className={cx('flex items-center gap-2.5 p-2 rounded-xl text-left', on ? 'bg-gold-tint border-2 border-ink' : 'bg-white border border-line')}>
              {CAT_IMG[c.key] ? <img src={CAT_IMG[c.key]} alt="" className="size-10 rounded-[9px] object-cover shrink-0" /> : <span className="size-10 rounded-[9px] bg-surface-2 shrink-0" />}
              <span className="flex-1 text-[13px] font-semibold">{c.short}</span>
              {on ? <Check className="size-4" /> : null}
            </button>
          )
        })}
      </div>
      <Field label="Years of practice" inputMode="numeric" value={years} onChange={(e) => setYears(e.target.value.replace(/\D/g, '').slice(0, 2))} placeholder="e.g. 8" />
      <Field label="Court(s) where you practise" value={courts} onChange={(e) => setCourts(e.target.value)} maxLength={200} placeholder="e.g. Indore District Court" />
      <Field label="Bar enrolment number" value={enrol} onChange={(e) => setEnrol(e.target.value.toUpperCase())} maxLength={40} placeholder="e.g. MP/1287/2014" />
      {error ? <Note tone="orange">{error}</Note> : null}
      <BottomBar>
        <Button size="lg" loading={busy} disabled={!ok} onClick={() => save({ practice, experienceYears: Number(years), courts: courts.trim(), enrolmentNumber: enrol.trim() }, onNext)}>
          Next: documents
        </Button>
      </BottomBar>
    </div>
  )
}

/* 3–7. one document per screen (also used for retakes) */
function DocStep({ i, me, setMe, wa, onBack, onNext, retake }) {
  const d = DOC_STEPS[i]
  const doc = me.documents.find((x) => x.key === d.key)
  // A retake starts with an empty frame, like the app; otherwise the uploaded photo is shown.
  const [fresh, setFresh] = useState(false)
  const shown = retake ? fresh : doc.status !== 'missing'
  const pic = useImagePick('/advocate/documents/' + d.key, (data) => (setMe(data), setFresh(true)))
  const last = i === DOC_STEPS.length - 1
  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={3 + i} title={d.title} sub={d.hint} onBack={onBack} support={wa} />
      <div className="relative h-[280px] rounded-2xl bg-ink grid place-items-center overflow-hidden">
        {shown ? (
          <SecureImage load={userFileUrl} path={'/advocate/documents/' + d.key + '/file'} version={doc.version} alt={d.title} className="w-full h-full object-contain" />
        ) : (
          <>
            <div className="absolute left-[34px] right-[34px] top-11 bottom-11 rounded-md bg-[#F4EEDD]/90 flex flex-col items-center pt-5 gap-2">
              <IdCard className="size-[30px] text-gold-text" />
              <span className="w-[70%] h-2 rounded bg-[#D8CDB0]" />
              <span className="w-1/2 h-1.5 rounded bg-[#E2D9C1]" />
              <span className="w-[84%] h-1.5 rounded bg-[#E2D9C1] mt-2.5" />
              <span className="w-[60%] h-1.5 rounded bg-[#E2D9C1]" />
            </div>
            {['left-5 top-[30px] border-l-[3px] border-t-[3px] rounded-tl-lg', 'right-5 top-[30px] border-r-[3px] border-t-[3px] rounded-tr-lg', 'left-5 bottom-[30px] border-l-[3px] border-b-[3px] rounded-bl-lg', 'right-5 bottom-[30px] border-r-[3px] border-b-[3px] rounded-br-lg'].map((c) => (
              <span key={c} className={cx('absolute size-7 border-gold', c)} />
            ))}
            <span className="absolute bottom-2 text-[12px] font-semibold text-gold">{pic.busy ? 'Uploading…' : 'Fit the whole document inside the frame'}</span>
          </>
        )}
      </div>
      {doc.status === 'reupload' && doc.note ? (
        <Note tone="orange" icon={TriangleAlert}>
          Our team asked for a retake: "{doc.note}"
        </Note>
      ) : null}
      {['All four corners visible', 'Name and number readable', 'No glare or shadow on the text'].map((t) => (
        <p key={t} className="flex items-center gap-2.5 text-[13px] font-medium text-text-2">
          <Check className="size-[18px] text-green" /> {t}
        </p>
      ))}
      {pic.inputs}
      <BottomBar>
        {shown ? (
          <>
            <Button size="lg" onClick={onNext}>
              {retake ? 'Use this photo' : last ? 'Review and submit' : 'Use this photo'}
            </Button>
            <Button size="lg" variant="line" icon={RotateCcw} loading={pic.busy} onClick={pic.takePhoto}>
              Retake
            </Button>
          </>
        ) : (
          <>
            <Button size="lg" icon={Camera} loading={pic.busy} onClick={pic.takePhoto}>
              Take photo
            </Button>
            <Button size="lg" variant="line" icon={ImageIcon} disabled={pic.busy} onClick={pic.choosePhoto}>
              Choose from gallery
            </Button>
          </>
        )}
      </BottomBar>
    </div>
  )
}

/* 8. review and submit */
function ReviewStep({ me, meta, setMe, wa, onBack, goTo }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const cats = Object.fromEntries(meta.categories.map((c) => [c.key, c.short]))
  const missingDocs = me.documents.filter((d) => d.status === 'missing').length
  const submit = async () => {
    setBusy(true)
    setError('')
    try {
      setMe((await userApi('/advocate/verification/submit', { method: 'POST' })).data)
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <StepHeader step={8} title="Review and submit" sub="Check everything once. Our team verifies it within 12 to 24 hours." onBack={onBack} support={wa} />
      <Card className="p-4 flex items-center gap-3">
        {me.hasPhoto ? <SecureImage load={userFileUrl} path="/advocate/photo" alt="" className="size-[52px] rounded-full object-cover ring-2 ring-gold" /> : <span className="size-[52px] rounded-full bg-surface-2" />}
        <div className="flex-1 min-w-0">
          <p className="text-[15px] font-bold">Adv. {me.user.name}</p>
          <p className="text-[12px] text-muted">
            {me.practice.map((k) => cats[k] ?? k).join(', ')} · {me.experienceYears} yrs
          </p>
          <p className="text-[12px] text-muted">
            {me.enrolmentNumber} · {me.district}
          </p>
        </div>
        <button onClick={() => goTo(1)} aria-label="Edit details" className="grid size-10 place-items-center rounded-xl border border-line">
          <Pencil className="size-4" />
        </button>
      </Card>
      <Card className="p-1">
        {me.documents.map((d, i) => (
          <button key={d.key} onClick={() => goTo(3 + i)} className={cx('w-full flex items-center gap-3 p-2.5 text-left', i && 'border-t border-line-soft')}>
            {d.status !== 'missing' ? (
              <SecureImage load={userFileUrl} path={'/advocate/documents/' + d.key + '/file'} version={d.version} alt="" className="size-12 rounded-lg object-cover bg-surface-2" />
            ) : (
              <span className="grid size-12 place-items-center rounded-lg bg-surface-2">
                <Camera className="size-5 text-muted" />
              </span>
            )}
            <span className="flex-1 text-[13.5px] font-semibold">{d.title}</span>
            {d.status !== 'missing' ? <Pill tone="green" dot={false}>Added</Pill> : <Pill tone="orange" dot={false}>Missing</Pill>}
          </button>
        ))}
      </Card>
      <Note icon={ShieldCheck}>Only the Vakeel Bhai verification team can see your documents. Aadhaar is never shown to clients.</Note>
      {error ? <Note tone="orange">{error}</Note> : null}
      <BottomBar hint={missingDocs ? missingDocs + ' documents still missing' : undefined}>
        <Button size="lg" loading={busy} disabled={me.missing.length > 0} onClick={submit}>
          Submit for verification
        </Button>
      </BottomBar>
    </div>
  )
}

/* ---------------- after submitting: status, retake, membership ---------------- */

function AfterSubmit({ me, meta, setMe, onRefresh }) {
  const [view, setView] = useState({ name: 'status' })
  if (view.name === 'retake') return <DocStep i={view.i} retake me={me} setMe={setMe} wa={meta.supportWhatsApp} onBack={() => setView({ name: 'status' })} onNext={() => setView({ name: 'status' })} />
  if (view.name === 'plans') return <Plans me={me} meta={meta} onBack={() => setView({ name: 'status' })} onPaid={onRefresh} />
  return <Status me={me} meta={meta} onRetake={(i) => setView({ name: 'retake', i })} onPlans={() => setView({ name: 'plans' })} />
}

const DOC_PILL = { approved: ['green', 'Approved'], reupload: ['orange', 'Retake'], rejected: ['red', 'Rejected'] }

/** The app's AdvStatus screen, plus "rejected", which the server can also return. */
function Status({ me, meta, onRetake, onPlans }) {
  const v = me.verification
  const ok = v.status === 'approved'
  const re = v.status === 'reupload'
  const no = v.status === 'rejected'
  const retakes = me.documents.map((d, i) => ({ d, i })).filter((x) => x.d.status === 'reupload')
  const Icon = ok ? ShieldCheck : no ? XCircle : Clock
  return (
    <div className="flex flex-col gap-3.5">
      <div className="bg-ink rounded-2xl p-5 text-white flex flex-col gap-2">
        <span className={cx('grid size-11 place-items-center rounded-xl border-[1.5px]', ok ? 'border-green' : no ? 'border-red' : 'border-gold')}>
          <Icon className={cx('size-[22px]', ok ? 'text-green' : no ? 'text-red' : 'text-gold')} />
        </span>
        <h1 className="font-serif font-bold text-[21px]">{ok ? 'You are verified' : re ? 'Almost there' : no ? 'Verification not approved' : 'Verification in progress'}</h1>
        <p className="text-[14px] text-on-ink-muted leading-relaxed">
          {ok
            ? 'Your documents are approved. Choose a membership to start receiving client requests.'
            : re
              ? 'Our team needs ' + (retakes.length === 1 ? 'one document' : retakes.length + ' documents') + ' again. Retake ' + (retakes.length === 1 ? 'it' : 'them') + ' and we will finish the check.'
              : no
                ? v.reason || 'Our team could not verify your details.'
                : 'Our team is checking your Bar Council documents. This usually takes 12 to 24 hours.'}
        </p>
      </div>

      {re && retakes.length ? (
        <div className="rounded-[14px] border border-[#F3D9C2] bg-[#FDF3EA] p-3.5 flex flex-col gap-2.5">
          <div className="flex gap-2.5">
            <TriangleAlert className="size-5 text-orange shrink-0" />
            <div className="text-[13px] text-[#7A3304]">
              <p className="text-[14px] font-bold">{retakes.length === 1 ? '1 document needs a retake' : retakes.length + ' documents need a retake'}</p>
              {retakes.map((x) => (
                <p key={x.d.key}>
                  {x.d.title}: "{x.d.note}"
                </p>
              ))}
            </div>
          </div>
          {retakes.map((x) => (
            <Button key={x.d.key} size="sm" variant="ink" onClick={() => onRetake(x.i)}>
              Retake {x.d.title}
            </Button>
          ))}
        </div>
      ) : null}

      {!no ? (
        <Card className="p-4">
          <Timeline
            steps={[
              { title: 'Profile submitted', sub: v.submittedAt ? dateShort(new Date(v.submittedAt).getTime()) : undefined, state: 'done' },
              { title: 'Documents uploaded', sub: me.documents.length + ' documents', state: 'done' },
              { title: 'Admin review', sub: ok ? 'Approved' : re ? 'Waiting for your retake' : 'Usually within 24 hours', state: ok ? 'done' : 'now' },
              { title: 'Choose a membership', sub: 'You start receiving client requests after this', state: ok ? 'now' : 'todo' },
            ]}
          />
        </Card>
      ) : null}

      <Card className="px-4 py-1">
        <p className="py-2.5 text-[14px] font-bold">Your documents</p>
        {me.documents.map((d) => {
          const [tone, label] = DOC_PILL[d.status] ?? ['neutral', 'In review']
          return (
            <div key={d.key} className="flex items-center gap-3 py-2.5 border-t border-line-soft">
              {d.status !== 'missing' ? (
                <SecureImage load={userFileUrl} path={'/advocate/documents/' + d.key + '/file'} version={d.version} alt="" className="size-10 rounded-lg object-cover bg-surface-2" />
              ) : (
                <span className="grid size-10 place-items-center rounded-lg bg-[#F4EEDD]">
                  <FileCheck className="size-[18px] text-gold-text" />
                </span>
              )}
              <span className="flex-1 text-[13px] font-semibold">{d.title}</span>
              <Pill tone={tone} dot={false}>
                {label}
              </Pill>
            </div>
          )
        })}
      </Card>

      <BottomBar>
        {ok ? (
          <Button size="lg" onClick={onPlans}>
            Choose a membership
          </Button>
        ) : (
          <WhatsAppLink wa={meta.supportWhatsApp} topic="Advocate verification">
            <Button size="lg" variant="line" icon={MessageCircle} className="w-full">
              Questions? WhatsApp support
            </Button>
          </WhatsAppLink>
        )}
      </BottomBar>
    </div>
  )
}

/**
 * The app's Plans screen (first membership, or renewal). Paying runs through the gateway and
 * the server activates the membership only after verifying the payment (SOW 4.4).
 */
export function Plans({ me, meta, onBack, renew = false, onPaid }) {
  const toast = useToast()
  const plans = meta.plans
  const [planId, setPlanId] = useState(() => (plans.find((p) => p.best) ?? plans[0])?.id)
  const [paying, setPaying] = useState(false)
  const [code, setCode] = useState('')
  const { pay, dialog } = useGatewayPay()
  const sel = plans.find((p) => p.id === planId)
  const gstPct = Math.round(meta.rates.gst * 10000) / 100
  const buy = async () => {
    setPaying(true)
    try {
      const co = (await userApi('/advocate/membership/checkout', { method: 'POST', body: { planId, ...(code.trim() ? { code: code.trim().toUpperCase() } : {}) } })).data
      await pay(co, { description: sel.name + ' membership' })
      toast(renew ? 'Membership renewed' : 'Membership active. Client requests will appear on your dashboard.', 'green')
      await onPaid?.()
      if (renew) onBack?.()
    } catch (e) {
      if (e.code !== 'CANCELLED') toast(errText(e), 'red')
    } finally {
      setPaying(false)
    }
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} aria-label="Back" className="grid size-10 place-items-center rounded-xl border border-line bg-white">
          <ArrowLeft className="size-5" />
        </button>
        <h1 className="text-[18px] font-bold">{renew ? 'Renew membership' : 'Membership'}</h1>
      </div>
      {!renew ? <Note icon={ShieldCheck}>Documents approved. One step left.</Note> : null}

      {/* Membership card preview (the app's MembershipCard, preview mode) */}
      <div className="rounded-2xl bg-ink p-5 text-white flex flex-col gap-4 shadow-pop">
        <div className="flex items-center justify-between">
          <img src={IMG.wordmarkWhite} alt="Vakeel Bhai" className="h-6" />
          <span className="text-[11px] font-bold uppercase tracking-wide text-gold">Verified advocate</span>
        </div>
        <div className="flex items-center gap-3">
          {me.hasPhoto ? <SecureImage load={userFileUrl} path="/advocate/photo" alt="" className="size-14 rounded-full object-cover ring-2 ring-gold" /> : null}
          <div>
            <p className="font-serif font-bold text-[18px]">Adv. {me.user.name}</p>
            <p className="text-[12px] text-on-ink-muted">Enrolment {me.enrolmentNumber}</p>
          </div>
        </div>
        <div className="flex justify-between text-[12px] text-on-ink-muted">
          <span>{me.membership?.memberId ?? 'Member ID after payment'}</span>
          <span className="font-semibold text-gold">{sel ? sel.name : 'Plan'}</span>
        </div>
      </div>

      <h2 className="text-[17px] font-bold mt-1">Choose a plan</h2>
      {plans.length === 0 ? (
        <Note tone="neutral">Membership plans will appear here once our team publishes them.</Note>
      ) : (
        plans.map((p) => {
          const on = p.id === planId
          return (
            <button key={p.id} role="radio" aria-checked={on} onClick={() => setPlanId(p.id)} className={cx('rounded-[14px] p-3.5 flex items-center gap-3 text-left', on ? 'bg-gold-wash border-2 border-ink' : 'bg-white border border-line')}>
              <Radio checked={on} />
              <span className="flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-[15px] font-bold">{p.name}</span>
                  {p.best ? <span className="rounded-md bg-gold-tint px-1.5 py-0.5 text-[10.5px] font-bold text-gold-text">Best value</span> : null}
                </span>
                <span className="block text-[12px] text-muted">{p.note}</span>
              </span>
              <span className="text-[15px] font-extrabold">{p.price == null ? '[PRICE]' : inr(p.price)}</span>
            </button>
          )
        })
      )}

      <Card className="p-4 flex flex-col gap-2.5">
        <p className="text-[14px] font-bold">Every plan includes</p>
        {['Client requests in your practice areas and district', 'Verified badge and a digital membership card', 'Wallet with a full commission and GST breakup, withdrawals to your bank', 'GST invoice for your membership fee'].map((t) => (
          <p key={t} className="flex gap-2.5 text-[13px] font-medium text-text-2">
            <Check className="size-[18px] text-green shrink-0" /> {t}
          </p>
        ))}
      </Card>
      {sel && sel.price == null ? <Note tone="gold">The price for this plan is set by our team before launch.</Note> : null}
      {renew && me.membership ? <Note tone="neutral">Your new period starts when the current one ends ({dateShort(new Date(me.membership.endAt).getTime())}).</Note> : null}

      <div className="flex items-center gap-4 mt-1">
        <div>
          <p className="text-[18px] font-extrabold">{sel?.price == null ? '[PRICE]' : inr(sel.price)}</p>
          <p className="text-[11.5px] font-medium text-muted">
            + {gstPct}% GST{sel ? ' · ' + sel.name : ''}
          </p>
        </div>
        <Button size="lg" className="flex-1" loading={paying} disabled={!sel || sel.price == null} onClick={buy}>
          {paying ? 'Activating…' : renew ? 'Renew' : 'Pay and activate'}
        </Button>
      </div>
      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} placeholder="Coupon code (optional)" aria-label="Coupon code" className="h-11 rounded-xl border border-line-strong px-3 text-[14px] font-semibold outline-none focus:border-ink max-w-xs" />
      <p className="text-[12px] text-muted -mt-2">The discount and GST are shown in the payment window before you pay.</p>
      {dialog}
    </div>
  )
}
