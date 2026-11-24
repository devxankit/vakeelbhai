import { useEffect, useState } from 'react'
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Menu, MessageCircle, X } from 'lucide-react'
import { Wordmark, cx } from '@/components/ui'
import { LangCtx, useLang, useT } from './lang'
import * as P from './pages'

const NAV = [
  { to: '/services', label: 'Legal services' },
  { to: '/e-challan', label: 'e-Challan' },
  { to: '/gst-filing', label: 'GST filing' },
  { to: '/for-advocates', label: 'For advocates' },
  { to: '/help', label: 'Help' },
]

function Header() {
  const t = useT()
  const { lang, setLang } = useLang()
  const [open, setOpen] = useState(false)
  const loc = useLocation()
  useEffect(() => setOpen(false), [loc.pathname])
  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-line">
      <div className="wrap flex items-center gap-6 h-[68px]">
        <Link to="/" aria-label="Vakeel Bhai home">
          <Wordmark dark={false} className="h-8" />
        </Link>
        <nav className="hidden lg:flex items-center gap-6 flex-1">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => cx('text-[14px] font-semibold hover:text-gold-text', isActive ? 'text-gold-text' : 'text-text')}>
              {t(n.label)}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-line-strong overflow-hidden text-[13px] font-semibold" role="group" aria-label="Language">
            <button onClick={() => setLang('en')} aria-pressed={lang === 'en'} className={cx('px-2.5 h-9', lang === 'en' ? 'bg-ink text-white' : 'bg-white')}>
              EN
            </button>
            <button onClick={() => setLang('hi')} aria-pressed={lang === 'hi'} className={cx('px-2.5 h-9', lang === 'hi' ? 'bg-ink text-white' : 'bg-white')}>
              हिं
            </button>
          </div>
          <Link to="/app" className="hidden sm:inline-flex h-10 items-center px-4 rounded-[10px] border border-line-strong text-[14px] font-semibold hover:bg-page">
            {t('Log in')}
          </Link>
          <Link to="/app/new" className="hidden sm:inline-flex h-10 items-center px-4 rounded-[10px] bg-gold text-ink text-[14px] font-bold hover:bg-gold-dark">
            {t('Request an advocate')}
          </Link>
          <button className="lg:hidden grid size-10 place-items-center rounded-lg border border-line" aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>
      {open ? (
        <div className="lg:hidden border-t border-line bg-white">
          <div className="wrap py-3 flex flex-col">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className="py-3 text-[15px] font-semibold border-b border-line-soft">
                {t(n.label)}
              </NavLink>
            ))}
            <div className="flex gap-2 pt-3">
              <Link to="/app" className="flex-1 h-11 grid place-items-center rounded-xl border border-line-strong font-semibold">
                {t('Log in')}
              </Link>
              <Link to="/app/new" className="flex-1 h-11 grid place-items-center rounded-xl bg-gold font-bold">
                {t('Request an advocate')}
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  )
}

function Footer() {
  const t = useT()
  const cols = [
    { title: 'Services', links: [['/services/criminal', 'Criminal lawyer'], ['/services/civil', 'Civil lawyer'], ['/services/matrimonial', 'Matrimonial lawyer'], ['/services/consumer', 'Consumer court'], ['/services/notary', 'Notary services']] },
    { title: 'Vakeel Bhai', links: [['/about', 'About'], ['/for-advocates', 'For advocates'], ['/contact', 'Contact'], ['/help', 'Help']] },
    { title: 'Legal', links: [['/legal/terms', 'Terms'], ['/legal/privacy', 'Privacy'], ['/legal/refund', 'Refund policy']] },
  ]
  return (
    <footer className="bg-ink text-on-ink">
      <div className="wrap py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="flex flex-col gap-3 max-w-xs">
          <Wordmark className="h-8 self-start" />
          <p className="text-[13px] leading-relaxed text-on-ink-muted">{t('Vakeel Bhai connects clients with verified advocates. We are a technology platform, not a law firm.')}</p>
          <a href="/help" className="inline-flex items-center gap-2 text-[13px] font-semibold text-gold">
            <MessageCircle className="size-4" /> {t('WhatsApp support')}
          </a>
        </div>
        {cols.map((c) => (
          <div key={c.title} className="flex flex-col gap-2.5">
            <p className="text-[13px] font-bold text-white">{t(c.title)}</p>
            {c.links.map(([to, l]) => (
              <Link key={to} to={to} className="text-[14px] text-on-ink-muted hover:text-white">
                {t(l)}
              </Link>
            ))}
          </div>
        ))}
      </div>
      <div className="border-t border-ink-line">
        <div className="wrap py-4 flex flex-wrap justify-between gap-2 text-[12px] text-on-ink-muted">
          <span>© {new Date().getFullYear()} Vakeel Bhai</span>
          <span>{t('Demo website: sample data only.')}</span>
        </div>
      </div>
    </footer>
  )
}

function ScrollTop() {
  const { pathname } = useLocation()
  useEffect(() => window.scrollTo(0, 0), [pathname])
  return null
}

export default function Site() {
  const [lang, setLangState] = useState(() => {
    try {
      return localStorage.getItem('vakeelbhai.site.lang') || 'en'
    } catch {
      return 'en'
    }
  })
  const setLang = (l) => {
    setLangState(l)
    try {
      localStorage.setItem('vakeelbhai.site.lang', l)
    } catch {
      /* per-visitor convenience only */
    }
    document.documentElement.lang = l
  }
  return (
    <LangCtx.Provider value={{ lang, setLang }}>
      <ScrollTop />
      <div className="min-h-screen flex flex-col">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route index element={<P.Home />} />
            <Route path="services" element={<P.Services />} />
            <Route path="services/:key" element={<P.ServiceDetail />} />
            <Route path="e-challan" element={<P.ChallanPage />} />
            <Route path="gst-filing" element={<P.GstPage />} />
            <Route path="for-advocates" element={<P.ForAdvocates />} />
            <Route path="about" element={<P.About />} />
            <Route path="contact" element={<P.Contact />} />
            <Route path="help" element={<P.Help />} />
            <Route path="legal/:doc" element={<P.Legal />} />
            <Route path="*" element={<P.NotFound />} />
          </Routes>
        </main>
        <Footer />
      </div>
    </LangCtx.Provider>
  )
}

