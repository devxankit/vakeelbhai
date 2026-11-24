import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Car, Check, ChevronDown, FileText, Lock, MessageCircle, Receipt, Scale, ShieldCheck, Wallet } from 'lucide-react'
import { Button, Field, Note, cx, useToast } from '@/components/ui'
import { CATEGORIES, categoryOf, DISTRICTS, FAQS, IMG, PHOTOS } from '@/lib/catalog'
import { act, useStore } from '@/lib/store'
import { inr, advocatePayout } from '@/lib/money'
import { useTitle } from '@/lib/format'
import { useT } from './lang'

const H2 = ({ children, className }) => <h2 className={cx('font-serif font-bold text-[clamp(1.6rem,3vw,2.2rem)] leading-tight text-ink', className)}>{children}</h2>

function Hero() {
  const t = useT()
  const nav = useNavigate()
  const [cat, setCat] = useState('matrimonial')
  const [district, setDistrict] = useState('Indore')
  return (
    <section className="bg-ink text-white">
      <div className="wrap flex flex-wrap items-center gap-10 py-14 md:py-16">
        <div className="flex-[1_1_440px] min-w-0 flex flex-col gap-6">
          <span className="self-start inline-flex items-center gap-2 text-[13px] font-semibold text-gold border border-ink-border rounded-full px-3 py-1.5">
            <ShieldCheck className="size-4" /> {t('Bar Council-verified advocates only')}
          </span>
          <h1 className="font-serif font-bold text-[clamp(2.2rem,4.6vw,3.4rem)] leading-[1.12]">{t('Legal help from a verified advocate, in your language.')}</h1>
          <p className="text-[17px] leading-relaxed text-on-ink max-w-xl">{t('Tell us your problem. We assign the right advocate in your district, you chat privately, and you pay only through Vakeel Bhai, released when you confirm the work.')}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              nav('/app/new?category=' + cat + '&district=' + encodeURIComponent(district))
            }}
            className="flex flex-wrap gap-2.5 bg-ink-2 border border-ink-line rounded-2xl p-2 max-w-xl">
            <label className="sr-only" htmlFor="h-cat">
              {t('Legal service')}
            </label>
            <select id="h-cat" value={cat} onChange={(e) => setCat(e.target.value)} className="flex-[1_1_200px] h-12 rounded-[10px] bg-white text-text px-3 font-semibold">
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>
                  {t(c.name)}
                </option>
              ))}
            </select>
            <label className="sr-only" htmlFor="h-dist">
              {t('District')}
            </label>
            <select id="h-dist" value={district} onChange={(e) => setDistrict(e.target.value)} className="flex-[1_1_140px] h-12 rounded-[10px] bg-white text-text px-3 font-semibold">
              {DISTRICTS.map((d) => (
                <option key={d}>{d}</option>
              ))}
            </select>
            <button className="flex-[1_1_180px] h-12 rounded-[10px] bg-gold text-ink font-bold hover:bg-gold-dark">{t('Request an advocate')}</button>
          </form>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[13.5px] font-medium text-on-ink">
            <span>✓ {t('Private in-app chat')}</span>
            <span>✓ {t('Pay safely, released on completion')}</span>
            <span>✓ {t('GST invoice for every payment')}</span>
          </div>
        </div>
        <div className="flex-[1_1_380px] min-w-0 relative">
          <img src={IMG.heroAdvocate} alt={t('An advocate at his desk')} className="w-full aspect-[4/3.2] object-cover rounded-[20px]" />
          <div className="absolute left-4 bottom-4 bg-white rounded-2xl px-3.5 py-3 flex items-center gap-2.5 shadow-pop">
            <img src={PHOTOS.imran} alt="" className="size-10 rounded-full object-cover" />
            <div>
              <p className="text-[14px] font-bold text-text">Adv. Imran Siddiqui</p>
              <p className="text-[12px] font-medium text-green">{t('Verified · Consumer and civil')}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

function ServiceGrid() {
  const t = useT()
  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
      {CATEGORIES.map((c) => (
        <Link key={c.key} to={'/services/' + c.key} className="card p-2.5 pb-4 flex flex-col gap-2 hover:border-line-strong hover:shadow-card transition">
          <img src={c.image} alt="" className="w-full aspect-[16/10] object-cover rounded-xl" />
          <h3 className="px-2 text-[16px] font-bold">{t(c.name)}</h3>
          <p className="px-2 text-[13.5px] leading-relaxed text-[#5F5B53]">{t(c.covers)}</p>
        </Link>
      ))}
    </div>
  )
}

function HowItWorks() {
  const t = useT()
  const steps = [
    ['Describe your problem', 'Pick a service and tell us what happened. Attach documents if you have them.'],
    ['Get a verified advocate', 'Our team assigns an advocate from your district whose Bar Council documents we have checked.'],
    ['Chat, pay, confirm', 'Agree on the fee in chat. Your payment is released only after you confirm the work is done.'],
  ]
  return (
    <div className="card p-6 sm:p-9 flex flex-col gap-7">
      <H2>{t('How it works')}</H2>
      <div className="grid gap-7 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
        {steps.map(([h, p], i) => (
          <div key={h} className="flex flex-col gap-2.5">
            <span className="grid size-9 place-items-center rounded-full bg-ink text-gold font-extrabold">{i + 1}</span>
            <p className="text-[17px] font-bold">{t(h)}</p>
            <p className="text-[14px] leading-relaxed text-[#5F5B53]">{t(p)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Faq({ items = FAQS }) {
  const t = useT()
  const [open, setOpen] = useState(0)
  return (
    <div className="flex flex-col gap-3">
      {items.map((f, i) => (
        <div key={f.q} className="card">
          <button className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left text-[15px] font-bold" aria-expanded={open === i} onClick={() => setOpen(open === i ? -1 : i)}>
            {t(f.q)}
            <ChevronDown className={cx('size-5 shrink-0 transition', open === i && 'rotate-180')} />
          </button>
          {open === i ? <p className="px-5 pb-4 text-[14px] leading-relaxed text-[#5F5B53]">{t(f.a)}</p> : null}
        </div>
      ))}
    </div>
  )
}

function AdvocateBand() {
  const t = useT()
  return (
    <section className="bg-ink">
      <div className="wrap flex flex-wrap items-center gap-8 py-14">
        <img src={IMG.emblem} alt="" className="w-[110px]" />
        <div className="flex-[1_1_380px] min-w-0 flex flex-col gap-2.5">
          <p className="font-serif font-bold text-[clamp(1.6rem,3vw,2.2rem)] text-white">{t('Are you an advocate?')}</p>
          <p className="text-[15px] leading-relaxed text-on-ink max-w-2xl">{t('Get verified once, take a membership, and receive client requests in your practice areas and district. Every payment comes with a clear commission and GST breakup.')}</p>
        </div>
        <Link to="/for-advocates" className="h-[52px] px-6 inline-flex items-center rounded-xl bg-gold text-ink font-bold hover:bg-gold-dark">
          {t('Join as an advocate')}
        </Link>
      </div>
    </section>
  )
}

/* ---------------- pages ---------------- */

export function Home() {
  const t = useT()
  useTitle('', 'Vakeel Bhai connects you with Bar Council-verified advocates. Private chat, safe payments released only when you confirm. e-Challan and GST filing too.')
  return (
    <>
      <Hero />
      <section className="wrap pt-16 pb-6 flex flex-col gap-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <H2>{t('What do you need help with?')}</H2>
          <Link to="/services" className="text-[14px] font-semibold text-gold-text hover:underline">
            {t('All legal services')}
          </Link>
        </div>
        <ServiceGrid />
      </section>
      <section className="wrap py-12">
        <HowItWorks />
      </section>
      <section className="wrap pb-12 grid gap-4 grid-cols-[repeat(auto-fit,minmax(320px,1fr))]">
        <div className="rounded-[20px] overflow-hidden bg-ink text-white flex flex-col">
          <img src={IMG.bannerTraffic} alt="" className="w-full h-44 object-cover" />
          <div className="p-6 flex flex-col gap-2.5">
            <p className="font-serif font-bold text-[22px]">{t('Pay your e-Challan')}</p>
            <p className="text-[14px] leading-relaxed text-on-ink">{t('Enter your vehicle number to see pending and paid challans, pay together, and download receipts.')}</p>
            <Link to="/e-challan" className="self-start mt-1.5 h-11 px-5 inline-flex items-center rounded-[10px] bg-gold text-ink font-bold">
              {t('Check challans')}
            </Link>
          </div>
        </div>
        <div className="rounded-[20px] bg-gold-tint p-7 flex flex-col gap-2.5 justify-end">
          <span className="grid size-14 place-items-center rounded-2xl bg-ink mb-auto">
            <Receipt className="size-7 text-gold" />
          </span>
          <p className="font-serif font-bold text-[22px] text-ink mt-6">{t('GST filing, handled')}</p>
          <p className="text-[14px] leading-relaxed text-[#4A3A12]">{t('Share your GSTIN and documents. Our team files your returns and you track every step in the app.')}</p>
          <Link to="/gst-filing" className="self-start mt-1.5 h-11 px-5 inline-flex items-center rounded-[10px] bg-ink text-white font-bold">
            {t('Request GST filing')}
          </Link>
        </div>
      </section>
      <AdvocateBand />
      <section className="wrap py-14 max-w-[860px] flex flex-col gap-5">
        <H2>{t('Common questions')}</H2>
        <Faq items={FAQS.slice(0, 4)} />
      </section>
    </>
  )
}

export function Services() {
  const t = useT()
  useTitle('Legal services', 'Criminal, civil, matrimonial, accident, consumer court and notary services from verified advocates.')
  return (
    <section className="wrap py-12 flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-serif font-bold text-[clamp(1.9rem,4vw,2.6rem)]">{t('Legal services')}</h1>
        <p className="text-[15px] text-muted max-w-2xl">{t('Choose a service. Our team assigns a verified advocate from your district and you talk privately in the app.')}</p>
      </div>
      <ServiceGrid />
      <div className="mt-6">
        <HowItWorks />
      </div>
    </section>
  )
}

export function ServiceDetail() {
  const t = useT()
  const { key } = useParams()
  const c = categoryOf(key)
  useTitle(c.name, c.long)
  return (
    <>
      <section className="bg-ink text-white">
        <div className="wrap py-12 flex flex-wrap items-center gap-10">
          <div className="flex-[1_1_420px] min-w-0 flex flex-col gap-5">
            <Link to="/services" className="text-[13px] font-semibold text-gold">
              ← {t('All legal services')}
            </Link>
            <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,3rem)] leading-tight">{t(c.name)}</h1>
            <p className="text-[16px] leading-relaxed text-on-ink max-w-xl">{t(c.long)}</p>
            <div className="flex flex-wrap gap-3">
              <Link to={'/app/new?category=' + c.key} className="h-12 px-6 inline-flex items-center gap-2 rounded-xl bg-gold text-ink font-bold">
                {t('Request an advocate')} <ArrowRight className="size-4" />
              </Link>
            </div>
          </div>
          <img src={c.image} alt="" className="flex-[0_1_340px] min-w-0 w-full max-w-[340px] aspect-square object-cover rounded-[20px]" />
        </div>
      </section>
      <section className="wrap py-12 grid gap-6 md:grid-cols-2">
        <div className="card p-6 flex flex-col gap-3">
          <h2 className="text-[18px] font-bold">{t('Keep these ready')}</h2>
          {c.docs.map((d) => (
            <p key={d} className="flex items-center gap-2.5 text-[14.5px]">
              <FileText className="size-[18px] text-gold-text" /> {t(d)}
            </p>
          ))}
          <p className="text-[13px] text-muted mt-1">{t('You can share them privately in the chat after an advocate is assigned.')}</p>
        </div>
        <div className="card p-6 flex flex-col gap-3">
          <h2 className="text-[18px] font-bold">{t('What you get')}</h2>
          {['A Bar Council-verified advocate from your district', 'Private chat, your number is never shared', 'A clear fee quote before you pay', 'Payment held until you confirm the work', 'GST invoice for every payment'].map((x) => (
            <p key={x} className="flex items-center gap-2.5 text-[14.5px]">
              <Check className="size-[18px] text-green" /> {t(x)}
            </p>
          ))}
        </div>
      </section>
      <section className="wrap pb-14">
        <HowItWorks />
      </section>
    </>
  )
}

export function ChallanPage() {
  const t = useT()
  const nav = useNavigate()
  const [num, setNum] = useState('')
  useTitle('Pay e-Challan online', 'Check pending and paid traffic challans for your vehicle and pay them online with Vakeel Bhai.')
  return (
    <section className="wrap py-12 grid gap-10 lg:grid-cols-2 items-center">
      <div className="flex flex-col gap-5">
        <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,3rem)] leading-tight">{t('Check and pay e-Challan')}</h1>
        <p className="text-[16px] leading-relaxed text-muted">{t('See pending and paid challans for your vehicle, pay several together, and keep every receipt in one place.')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            nav('/app/challan?vehicle=' + encodeURIComponent(num))
          }}
          className="flex flex-wrap gap-2.5">
          <Field label={t('Vehicle number')} className="flex-[1_1_240px]" value={num} onChange={(e) => setNum(e.target.value.toUpperCase())} placeholder="MP 09 AB 1234" />
          <Button type="submit" size="lg" className="self-end" disabled={num.replace(/\s/g, '').length < 8}>
            {t('Check challans')}
          </Button>
        </form>
        <Note tone="gold">{t('Live challan data comes from the e-Challan provider connected in the backend phase. The demo shows sample challans.')}</Note>
      </div>
      <div className="rounded-[20px] overflow-hidden bg-ink relative">
        <img src={IMG.bannerTraffic} alt="" className="w-full aspect-[4/3] object-cover opacity-80" />
        <div className="absolute left-5 bottom-5 bg-white rounded-2xl p-4 flex items-center gap-3 shadow-pop">
          <span className="grid size-11 place-items-center rounded-xl bg-ink">
            <Car className="size-6 text-gold" />
          </span>
          <div>
            <p className="font-extrabold tracking-wider">MP 09 AB 1234</p>
            <p className="text-[12px] text-orange font-semibold">{t('2 pending · ₹2,000')}</p>
          </div>
        </div>
      </div>
    </section>
  )
}

export function GstPage() {
  const t = useT()
  useTitle('GST filing service', 'Our team files your GST returns (GSTR-1, GSTR-3B, annual) and new registrations. Track every step online.')
  const steps = ['Share your GSTIN, period and documents', 'Our team reviews and asks for anything missing', 'We file the return and send you the acknowledgement']
  return (
    <section className="wrap py-12 grid gap-10 lg:grid-cols-2">
      <div className="flex flex-col gap-5">
        <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,3rem)] leading-tight">{t('GST filing, handled')}</h1>
        <p className="text-[16px] leading-relaxed text-muted">{t('GSTR-1, GSTR-3B, annual returns and new registrations. Our team does the filing, you track every step and chat with support.')}</p>
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-3">
              <span className="grid size-8 place-items-center rounded-full bg-ink text-gold font-bold text-[13px]">{i + 1}</span>
              <span className="text-[15px] font-medium">{t(s)}</span>
            </div>
          ))}
        </div>
        <Link to="/app/gst" className="self-start h-12 px-6 inline-flex items-center rounded-xl bg-gold text-ink font-bold">
          {t('Request GST filing')}
        </Link>
      </div>
      <div className="rounded-[20px] bg-gold-tint p-8 flex flex-col gap-4">
        {['GSTR-1', 'GSTR-3B', 'GSTR-9 (annual)', 'New GST registration'].map((r) => (
          <div key={r} className="bg-white rounded-xl px-4 py-3.5 flex items-center justify-between">
            <span className="font-bold">{t(r)}</span>
            <span className="text-[13px] text-muted">{t('Fee shown before we start')}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

export function ForAdvocates() {
  const t = useT()
  const { s } = useStore()
  useTitle('For advocates', 'Join Vakeel Bhai as a verified advocate. Receive client requests in your practice areas and district.')
  const ex = advocatePayout(10000, { commission: s.settings.commission, gst: s.settings.gst })
  return (
    <>
      <section className="bg-ink text-white">
        <div className="wrap py-14 flex flex-wrap items-center gap-10">
          <div className="flex-[1_1_440px] flex flex-col gap-5">
            <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,3rem)] leading-tight">{t('Grow your practice with verified client requests')}</h1>
            <p className="text-[16px] leading-relaxed text-on-ink max-w-xl">{t('Get verified once. Our team sends you requests that match your practice areas and district. Chat with clients, send quotes and get paid to your wallet.')}</p>
            <Link to="/advocate" className="self-start h-12 px-6 inline-flex items-center gap-2 rounded-xl bg-gold text-ink font-bold">
              {t('Register as an advocate')} <ArrowRight className="size-4" />
            </Link>
          </div>
          <img src={IMG.emblem} alt="" className="w-[180px] mx-auto" />
        </div>
      </section>
      <section className="wrap py-12 grid gap-4 grid-cols-[repeat(auto-fit,minmax(250px,1fr))]">
        {[
          [BadgeCheck, 'Verified badge', 'Clients see your verified badge, experience and court once you accept their request.'],
          [MessageCircle, 'Private chat', 'Talk to clients in the app. Phone numbers are never shared on either side.'],
          [Wallet, 'Clear payouts', 'Every payment shows the fee, commission and GST. Withdraw to your bank or UPI.'],
          [Scale, 'Requests in your area', 'Our team assigns requests that match your practice areas and district.'],
        ].map(([I, h, p]) => (
          <div key={h} className="card p-5 flex flex-col gap-2.5">
            <span className="grid size-11 place-items-center rounded-xl bg-gold-tint">
              <I className="size-5 text-gold-text" />
            </span>
            <p className="text-[16px] font-bold">{t(h)}</p>
            <p className="text-[14px] leading-relaxed text-[#5F5B53]">{t(p)}</p>
          </div>
        ))}
      </section>
      <section className="wrap pb-14 grid gap-6 lg:grid-cols-2">
        <div className="card p-6 flex flex-col gap-3">
          <h2 className="text-[18px] font-bold">{t('How verification works')}</h2>
          {['Your details and practice areas', 'District Bar Association card', 'State Bar Council certificate', 'Enrolment certificate', 'Aadhaar (only our team sees it)', 'Admin review, usually within 24 hours'].map((x, i) => (
            <p key={x} className="flex items-center gap-3 text-[14.5px]">
              <span className="grid size-6 place-items-center rounded-full bg-ink text-gold text-[12px] font-bold">{i + 1}</span> {t(x)}
            </p>
          ))}
        </div>
        <div className="card p-6 flex flex-col gap-3">
          <h2 className="text-[18px] font-bold">{t('Example payout on a ₹10,000 fee')}</h2>
          <div className="flex justify-between text-[14px]">
            <span>{t('Fee paid by the client')}</span>
            <span className="font-semibold">{inr(ex.base)}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span>{t('Platform commission')} ({Math.round(s.settings.commission * 100)}%)</span>
            <span className="font-semibold">−{inr(ex.commission)}</span>
          </div>
          <div className="flex justify-between text-[14px]">
            <span>{t('GST on commission')} ({Math.round(s.settings.gst * 100)}%)</span>
            <span className="font-semibold">−{inr(ex.gstOnCommission)}</span>
          </div>
          <div className="flex justify-between text-[16px] font-extrabold border-t border-line pt-3">
            <span>{t('You receive')}</span>
            <span>{inr(ex.net)}</span>
          </div>
          <p className="text-[13px] text-muted">{t('Membership plans (monthly, quarterly, yearly) are priced by Vakeel Bhai before launch.')}</p>
          <div className="flex flex-wrap gap-2 mt-1">
            {s.settings.plans.filter((p) => p.active).map((p) => (
              <span key={p.id} className="rounded-lg border border-line px-3 py-1.5 text-[13px] font-semibold">
                {t(p.name)} · {p.price ? inr(p.price) : '[PRICE]'}
              </span>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

export function About() {
  const t = useT()
  useTitle('About us')
  return (
    <section className="wrap py-14 max-w-[820px] flex flex-col gap-5">
      <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,2.8rem)]">{t('About Vakeel Bhai')}</h1>
      <p className="text-[16px] leading-relaxed text-text-2">{t('Vakeel Bhai makes legal help simple and safe. We check every advocate\'s Bar Council documents, match your request with the right advocate in your district, and hold your payment until you confirm the work is done.')}</p>
      <p className="text-[16px] leading-relaxed text-text-2">{t('We also help with everyday paperwork: paying traffic e-Challans and filing GST returns, in nine Indian languages.')}</p>
      <Note tone="neutral" icon={ShieldCheck}>
        {t('Vakeel Bhai is a technology platform, not a law firm. Advocates on the platform are independent professionals.')}
      </Note>
    </section>
  )
}

export function Contact() {
  const t = useT()
  const { update } = useStore()
  const toast = useToast()
  const [f, setF] = useState({ name: '', phone: '', email: '', message: '' })
  useTitle('Contact us')
  const ok = f.name.trim() && /^[6-9]\d{9}$/.test(f.phone) && f.message.trim().length > 5
  return (
    <section className="wrap py-14 grid gap-10 lg:grid-cols-[1fr_1.2fr]">
      <div className="flex flex-col gap-4">
        <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,2.8rem)]">{t('Contact us')}</h1>
        <p className="text-[16px] leading-relaxed text-muted">{t('Questions about a request, payments or joining as an advocate? Write to us and our team will reply.')}</p>
        <Note tone="gold" icon={MessageCircle}>
          {t('The WhatsApp support number is added before launch.')}
        </Note>
      </div>
      <form
        className="card p-6 flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault()
          update((s) => act.addEnquiry(s, f))
          setF({ name: '', phone: '', email: '', message: '' })
          toast(t('Thank you. Our team will contact you.'), 'green')
        }}>
        <Field label={t('Your name')} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Field label={t('Mobile number')} prefix="+91" inputMode="tel" maxLength={10} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '') })} />
        <Field label={t('Email (optional)')} type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Field label={t('Message')} as="textarea" value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
        <Button type="submit" size="lg" disabled={!ok}>
          {t('Send message')}
        </Button>
      </form>
    </section>
  )
}

export function Help() {
  const t = useT()
  useTitle('Help and FAQs')
  return (
    <section className="wrap py-14 max-w-[860px] flex flex-col gap-6">
      <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,2.8rem)]">{t('Help and FAQs')}</h1>
      <Faq />
      <div className="card p-5 flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 font-semibold">
          <Lock className="size-5 text-green" /> {t('Still need help? Contact our team.')}
        </span>
        <Link to="/contact" className="h-10 px-4 inline-flex items-center rounded-[10px] bg-ink text-white font-semibold">
          {t('Contact us')}
        </Link>
      </div>
    </section>
  )
}

const LEGAL = {
  terms: ['Terms of use', ['Vakeel Bhai is a technology platform that connects clients with independent, verified advocates. Vakeel Bhai is not a law firm and does not give legal advice.', 'Advocates set their own fees. Payments are made through Vakeel Bhai and held until the client confirms the work, or until the auto-confirm period passes without a dispute.', 'Vakeel Bhai keeps a platform commission from the advocate\'s fee, plus GST on it.', 'Draft text for the demo. The client provides the final terms before launch.']],
  privacy: ['Privacy policy', ['We collect your mobile number, name, city and the details you share in requests and chats, so we can connect you with an advocate.', 'Advocate documents, including Aadhaar, are visible only to the Vakeel Bhai verification team.', 'Phone numbers are never shared between clients and advocates.', 'Draft text for the demo. The client provides the final policy before launch.']],
  refund: ['Refund policy', ['If the agreed work is not done, raise a dispute before confirming. The payment stays on hold while our team reviews it.', 'If the dispute is upheld, the amount is refunded to your original payment method.', 'Membership fees are non-refundable once the membership is active.', 'Draft text for the demo. The client provides the final policy before launch.']],
}

export function Legal() {
  const t = useT()
  const { doc } = useParams()
  const [title, paras] = LEGAL[doc] ?? LEGAL.terms
  useTitle(title)
  return (
    <section className="wrap py-14 max-w-[820px] flex flex-col gap-4">
      <h1 className="font-serif font-bold text-[clamp(2rem,4.4vw,2.6rem)]">{t(title)}</h1>
      {paras.map((p) => (
        <p key={p} className="text-[15.5px] leading-relaxed text-text-2">
          {t(p)}
        </p>
      ))}
    </section>
  )
}

export function NotFound() {
  const t = useT()
  useTitle('Page not found')
  return (
    <section className="wrap py-24 flex flex-col items-center gap-4 text-center">
      <p className="font-serif font-bold text-[40px]">404</p>
      <p className="text-muted">{t('This page does not exist.')}</p>
      <Link to="/" className="h-11 px-5 inline-flex items-center rounded-xl bg-gold font-bold">
        {t('Go home')}
      </Link>
    </section>
  )
}
