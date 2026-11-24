/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { CATEGORIES, categoryOf, CHALLANS, DOC_STEPS } from './catalog'
import { advocatePayout, clientBill, inr, offerDiscount } from './money'
import { addMonths, DAY } from './format'

/**
 * ONE DEMO STORE for the website portals and the admin panel (UI-only phase).
 * Saved in this browser's localStorage and synced between tabs, so the admin
 * panel in one tab drives the client and advocate portals in another.
 *
 * Sample advocates and clients (isDemo) act on their own with timers in tick():
 * a demo advocate accepts and quotes, a demo client pays and confirms. Your own
 * portal accounts never act automatically. The backend phase replaces this
 * file with the API; the screens keep the same shape.
 */

const KEY = 'vakeelbhai.web.v1'
const now = () => Date.now()
let seq = 0
export const uid = (p = '') => p + Date.now().toString(36) + (seq++).toString(36)

/* ------------------------------------------------------------------ seed */

function sampleDocs(status = 'approved') {
  const d = {}
  DOC_STEPS.forEach((s) => (d[s.key] = { src: 'sample', status }))
  return d
}

function seed() {
  const t = now()
  const adv = (id, name, photo, practice, district, years, rating, reviews, enrolment, extra = {}) => ({
    id, name, photo, phone: '98' + String(100 + id.length * 7).padEnd(8, '1'), email: id + '@example.com', district, state: 'Madhya Pradesh', practice, years, courts: district + ' District Court',
    enrolment, rating, reviews, languages: 'Hindi, English', status: 'approved', blocked: false, docs: sampleDocs(), isDemo: true, joinedAt: t - 200 * DAY,
    membership: { planId: 'year', start: t - 60 * DAY, end: addMonths(t - 60 * DAY, 12), memberId: 'VB-AD-00' + (300 + reviews % 99) },
    wallet: 8000 + reviews * 31, hold: 0, lifetime: 40000 + reviews * 210, bank: { holder: name.replace('Adv. ', ''), account: '50100234567' + reviews, ifsc: 'HDFC0001234', upi: '' }, ...extra,
  })
  const advocates = [
    adv('priya', 'Priya Nair', 'priya', ['matrimonial', 'civil'], 'Indore', 11, 4.8, 126, 'MP/0874/2015'),
    adv('rohan', 'Rohan Malhotra', 'rohan', ['criminal', 'civil'], 'Indore', 12, 4.7, 58, 'MP/1287/2014'),
    adv('imran', 'Imran Siddiqui', 'imran', ['consumer', 'notary', 'other'], 'Bhopal', 8, 4.6, 41, 'MP/2210/2018'),
    adv('harpreet', 'Harpreet Singh Bedi', 'harpreet', ['accident', 'criminal'], 'Ujjain', 19, 4.9, 203, 'MP/0412/2007'),
    adv('neha', 'Neha Sharma', null, ['civil', 'consumer'], 'Indore', 4, 0, 0, 'MP/3011/2022', { status: 'pending', docs: sampleDocs('uploaded'), membership: null, wallet: 0, lifetime: 0, bank: null, joinedAt: t - 2 * DAY }),
    adv('vikas', 'Vikas Tiwari', null, ['criminal'], 'Jabalpur', 7, 0, 0, 'MP/2650/2019', { status: 'pending', docs: sampleDocs('uploaded'), membership: null, wallet: 0, lifetime: 0, bank: null, joinedAt: t - 1 * DAY }),
  ]
  const cl = (id, name, photo, city, extra = {}) => ({ id, name, photo, phone: '97' + String(id.length * 13).padEnd(8, '3'), email: id + '@example.com', city, state: 'Madhya Pradesh', wallet: 0, walletTx: [], vehicles: [], paidChallans: [], referralCode: 'VB' + id.toUpperCase().slice(0, 5) + '21', blocked: false, isDemo: true, joinedAt: t - 40 * DAY, usedFirst10: true, ...extra })
  const clients = [
    cl('kavita', 'Kavita Joshi', null, 'Indore'), cl('sunil', 'Sunil Verma', null, 'Ujjain'), cl('farhan', 'Farhan Ali', null, 'Bhopal'),
    cl('meena', 'Meena Patel', null, 'Indore'), cl('rakesh', 'Rakesh Yadav', null, 'Indore'), cl('gurpreet', 'Gurpreet Singh', 'gurpreet', 'Indore'), cl('ananyak', 'Ananya Kapoor', 'ananya', 'Indore'),
  ]
  const req = (id, clientId, category, issue, district, lang, createdAgoMin, extra = {}) => ({ id, clientId, category, issue, district, lang, docs: [], createdAt: t - createdAgoMin * 60000, status: 'submitted', declined: [], ...extra })
  const paidReq = (id, clientId, category, advocateId, fee, daysAgo, status = 'completed') => {
    const bill = clientBill(fee, { gstOnService: categoryOf(category).gstOnService })
    return req(id, clientId, category, 'Sample completed matter for reports and history.', 'Indore', 'Hindi', daysAgo * 1440, {
      status, advocateId, assignedAt: t - daysAgo * DAY, acceptedAt: t - daysAgo * DAY, quote: { fee, scope: categoryOf(category).demoScope, validTill: t, at: t - daysAgo * DAY },
      paid: { ...bill, at: t - (daysAgo - 1) * DAY, rates: { commission: 0.2, gst: 0.18 } }, doneAt: status === 'completed' ? t - (daysAgo - 3) * DAY : undefined, completedAt: status === 'completed' ? t - (daysAgo - 4) * DAY : undefined, rating: status === 'completed' ? 5 : undefined,
    })
  }
  const requests = [
    req('VB-1063', 'kavita', 'matrimonial', 'Husband has stopped paying household expenses. Want to file for maintenance for me and my daughter.', 'Indore', 'Hindi', 130, { urgent: true }),
    req('VB-1062', 'sunil', 'accident', 'Truck hit my bike near Dewas gate. Insurance company is not responding. Need help with MACT claim.', 'Ujjain', 'Hindi', 105),
    req('VB-1060', 'farhan', 'consumer', 'Builder delayed possession by 2 years and is asking for extra money.', 'Bhopal', 'English', 58),
    req('VB-1059', 'meena', 'notary', 'Need an affidavit for a name change on documents, notarised this week.', 'Indore', 'Gujarati', 31),
    req('VB-1058', 'rakesh', 'criminal', 'Police complaint filed against me by a neighbour. Need advice on anticipatory bail.', 'Indore', 'Hindi', 12),
    paidReq('VB-1031', 'gurpreet', 'consumer', 'imran', 3500, 6, 'paid'),
    paidReq('VB-1019', 'ananyak', 'civil', 'priya', 4500, 12),
    paidReq('VB-0988', 'rakesh', 'criminal', 'rohan', 12000, 20),
    paidReq('VB-0951', 'farhan', 'consumer', 'imran', 3500, 26),
    paidReq('VB-0920', 'kavita', 'matrimonial', 'priya', 5000, 34),
    paidReq('VB-0897', 'sunil', 'accident', 'harpreet', 6000, 41),
  ]
  requests.find((r) => r.id === 'VB-1031').dispute = { reason: 'Advocate stopped responding: no update for 5 days after payment.', at: t - 1 * DAY, status: 'open' }
  requests.find((r) => r.id === 'VB-1031').status = 'disputed'

  const tx = []
  requests.filter((r) => r.paid).forEach((r) => {
    tx.push({ id: uid('t'), at: r.paid.at, kind: 'service', ref: r.id, clientId: r.clientId, advocateId: r.advocateId, amount: r.paid.total, gst: r.paid.gst, fee: r.paid.base, status: 'Captured' })
  })
  advocates.filter((a) => a.membership).forEach((a) => tx.push({ id: uid('t'), at: a.membership.start, kind: 'membership', ref: a.membership.memberId, advocateId: a.id, amount: 0, gst: 0, status: 'Demo · price at launch' }))
  tx.push({ id: uid('t'), at: t - 3 * DAY, kind: 'challan', ref: 'VBC08113351', clientId: 'kavita', amount: 1500, gst: 0, status: 'Captured' })

  return {
    v: 1,
    settings: {
      commission: 0.2,
      gst: 0.18,
      autoConfirmDays: 7,
      referralReward: 150,
      referralOn: true,
      supportWhatsApp: '',
      demoAuto: true,
      categoryCommission: {},
      categories: CATEGORIES.map((c) => ({ key: c.key, name: c.name, active: true })),
      plans: [
        { id: 'month', name: 'Monthly', months: 1, price: null, active: true },
        { id: 'quarter', name: 'Quarterly', months: 3, price: null, active: true },
        { id: 'year', name: 'Yearly', months: 12, price: null, active: true, best: true },
      ],
      offers: [
        { code: 'FIRST10', title: '10% off your first consultation', percent: 10, max: 500, till: '30 Nov 2026', active: true, firstOnly: true },
        { code: 'NOTARY100', title: '₹100 cashback on notary services', cashback: 100, till: '31 Dec 2026', active: true },
      ],
      banners: [
        { id: 'b1', title: '10% off your first consultation', sub: 'Use code FIRST10 at checkout', tag: 'Till 30 Nov', image: 'bannerGavel', active: true },
        { id: 'b2', title: 'Talk to a verified advocate today', sub: 'Matched by our team in your district', tag: 'New', image: 'bannerConsult', active: true },
        { id: 'b3', title: 'Clear your e-Challans in one go', sub: 'See pending fines and pay safely', tag: 'e-Challan', image: 'bannerTraffic', active: true },
      ],
    },
    advocates,
    clients,
    requests,
    chats: {},
    tx,
    withdrawals: [
      { id: 'WD-201', advocateId: 'priya', amount: 12000, to: 'HDFC ••3412', at: t - 6 * 3600000, status: 'requested' },
      { id: 'WD-198', advocateId: 'harpreet', amount: 20000, to: 'SBI ••0921', at: t - 2 * DAY, status: 'paid', utr: 'UTR628104' },
    ],
    gstRequests: [
      { id: 'GST-301', clientId: 'farhan', gstin: '23ABCDE1234F1Z5', returnType: 'GSTR-3B', period: 'October 2026', note: '', at: t - 2 * DAY, status: 'In review' },
      { id: 'GST-302', clientId: 'meena', gstin: '', returnType: 'New GST registration', period: 'Meena Handicrafts', note: 'Home-based business', at: t - 5 * 3600000, status: 'Requested' },
    ],
    challanPays: [],
    enquiries: [{ id: uid('e'), name: 'Rahul Mehta', phone: '9826012345', email: '', message: 'Do you have advocates in Dewas for property matters?', at: t - 4 * 3600000 }],
    notices: {},
    session: { client: null, advocate: null, admin: false },
    nextReq: 1110,
  }
}

/* ------------------------------------------------------------------ helpers */

const notify = (s, userId, title, body) => ({ ...s, notices: { ...s.notices, [userId]: [{ id: uid('n'), title, body, at: now() }, ...(s.notices[userId] ?? [])].slice(0, 60) } })
const sysMsg = (text, at = now()) => ({ id: uid('m'), from: 'system', kind: 'text', text, at })
const push = (s, chatId, m) => ({ ...s, chats: { ...s.chats, [chatId]: [...(s.chats[chatId] ?? []), m] } })
const patchReq = (s, id, p) => ({ ...s, requests: s.requests.map((r) => (r.id === id ? { ...r, ...(typeof p === 'function' ? p(r) : p) } : r)) })
const patchAdv = (s, id, p) => ({ ...s, advocates: s.advocates.map((a) => (a.id === id ? { ...a, ...(typeof p === 'function' ? p(a) : p) } : a)) })
const patchClient = (s, id, p) => ({ ...s, clients: s.clients.map((c) => (c.id === id ? { ...c, ...(typeof p === 'function' ? p(c) : p) } : c)) })

export const ratesFor = (s, category) => ({ commission: s.settings.categoryCommission?.[category] ?? s.settings.commission, gst: s.settings.gst })
export const advById = (s, id) => s.advocates.find((a) => a.id === id)
export const clientById = (s, id) => s.clients.find((c) => c.id === id)
export const membershipActive = (a) => !!a?.membership && a.membership.end > now()

/* ------------------------------------------------------------------ actions (pure: state -> state) */

export const act = {
  /* sessions */
  loginClient(s, phone) {
    let c = s.clients.find((x) => x.phone === phone && !x.isDemo)
    if (!c) {
      c = { id: uid('c'), name: '', phone, email: '', city: 'Indore', state: 'Madhya Pradesh', wallet: 150, walletTx: [{ id: uid('t'), type: 'referral', title: 'Welcome reward (demo)', amount: 150, at: now() }], vehicles: [{ number: 'MP 09 AB 1234', model: 'Hyundai i20 · Petrol' }], paidChallans: [], referralCode: '', blocked: false, isDemo: false, joinedAt: now(), usedFirst10: false }
      s = { ...s, clients: [c, ...s.clients] }
    }
    return { ...s, session: { ...s.session, client: c.id } }
  },
  loginAdvocate(s, phone) {
    let a = s.advocates.find((x) => x.phone === phone && !x.isDemo)
    if (!a) {
      a = { id: uid('a'), name: '', photo: null, phone, email: '', district: 'Indore', state: 'Madhya Pradesh', practice: [], years: '', courts: '', enrolment: '', rating: 0, reviews: 0, languages: 'Hindi, English', status: 'none', blocked: false, docs: {}, isDemo: false, joinedAt: now(), membership: null, wallet: 0, hold: 0, lifetime: 0, bank: null }
      s = { ...s, advocates: [a, ...s.advocates] }
    }
    return { ...s, session: { ...s.session, advocate: a.id } }
  },
  logout: (s, role) => ({ ...s, session: { ...s.session, [role]: role === 'admin' ? false : null } }),

  /* client */
  saveClient: (s, id, p) => {
    s = patchClient(s, id, (c) => ({ ...p, referralCode: c.referralCode || 'VB' + (p.name || c.name || 'USER').replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase() + String(100 + Math.floor(Math.random() * 900)) }))
    return s
  },
  submitRequest(s, clientId, r) {
    const id = 'VB-' + s.nextReq
    s = { ...s, nextReq: s.nextReq + 1, requests: [{ id, clientId, ...r, createdAt: now(), status: 'submitted', declined: [] }, ...s.requests] }
    s = push(s, id, sysMsg('Request submitted. Our team will assign a verified advocate.'))
    return notify(s, clientId, 'Request ' + id + ' received', 'We are finding a verified ' + categoryOf(r.category).name.toLowerCase() + ' in ' + r.district + '.')
  },
  sendMessage: (s, chatId, from, m) => push(s, chatId, { id: uid('m'), from, kind: 'text', at: now(), ...m }),
  payRequest(s, id, { useOffer, useWallet }) {
    const r = s.requests.find((x) => x.id === id)
    const c = clientById(s, r.clientId)
    const cat = categoryOf(r.category)
    const discount = useOffer && !c.usedFirst10 ? offerDiscount(r.quote.fee, { percent: 10, max: 500 }) : 0
    const bill = clientBill(r.quote.fee, { discount, gstOnService: cat.gstOnService, wallet: useWallet ? c.wallet : 0, rates: ratesFor(s, r.category) })
    s = patchClient(s, c.id, (x) => ({ wallet: x.wallet - bill.wallet, usedFirst10: x.usedFirst10 || discount > 0, walletTx: bill.wallet ? [{ id: uid('t'), type: 'spend', title: 'Used for request ' + id, amount: -bill.wallet, at: now() }, ...x.walletTx] : x.walletTx }))
    s = patchReq(s, id, { status: 'paid', paid: { ...bill, at: now(), offer: discount ? 'FIRST10' : undefined, rates: ratesFor(s, r.category) } })
    const pay = advocatePayout(bill.base, ratesFor(s, r.category))
    s = patchAdv(s, r.advocateId, (a) => ({ hold: a.hold + pay.net }))
    s = { ...s, tx: [{ id: uid('t'), at: now(), kind: 'service', ref: id, clientId: c.id, advocateId: r.advocateId, amount: bill.total, gst: bill.gst, fee: bill.base, status: 'Captured' }, ...s.tx] }
    s = push(s, id, sysMsg('Payment of ' + inr(bill.total) + ' received. It is held safely until the client confirms the work is done.'))
    s = notify(s, c.id, 'Payment successful', inr(bill.total) + ' paid for request ' + id + '.')
    return notify(s, r.advocateId, 'Client paid', c.name + ' paid your quote for ' + id + '. ' + inr(pay.net) + ' is on hold for you.')
  },
  confirmRequest(s, id, rating = 5, review = '') {
    const r = s.requests.find((x) => x.id === id)
    if (!r || !['done', 'paid'].includes(r.status)) return s
    const pay = advocatePayout(r.paid.base, r.paid.rates ?? ratesFor(s, r.category))
    s = patchReq(s, id, { status: 'completed', completedAt: now(), rating, review })
    s = patchAdv(s, r.advocateId, (a) => ({
      hold: Math.max(0, a.hold - pay.net), wallet: a.wallet + pay.net, lifetime: a.lifetime + pay.net,
      reviews: a.reviews + 1, rating: a.rating ? Math.round(((a.rating * a.reviews + rating) / (a.reviews + 1)) * 10) / 10 : rating,
    }))
    s = push(s, id, sysMsg('The client confirmed the work. ' + inr(pay.net) + ' was credited to the advocate\'s wallet.'))
    return notify(s, r.advocateId, 'Payment credited', inr(pay.net) + ' for ' + id + ' is in your wallet.')
  },
  disputeRequest(s, id, reason) {
    s = patchReq(s, id, { status: 'disputed', dispute: { reason, at: now(), status: 'open' } })
    return push(s, id, sysMsg('Dispute raised. Our team will reply in this chat within 24 hours. The payment stays on hold.'))
  },
  payChallans(s, clientId, ids) {
    const receipt = 'VBC' + String(now()).slice(-8)
    const paidOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
    const add = CHALLANS.filter((c) => ids.includes(c.id)).map((c) => ({ ...c, paidOn, receipt }))
    const total = add.reduce((a, c) => a + c.amount, 0)
    s = patchClient(s, clientId, (c) => ({ paidChallans: [...add, ...c.paidChallans] }))
    s = { ...s, tx: [{ id: uid('t'), at: now(), kind: 'challan', ref: receipt, clientId, amount: total, gst: 0, status: 'Captured' }, ...s.tx] }
    return { s: notify(s, clientId, 'e-Challan paid', inr(total) + ' paid. Receipt ' + receipt + '.'), receipt, total }
  },
  addVehicle: (s, clientId, number) => patchClient(s, clientId, (c) => ({ vehicles: [...c.vehicles, { number: number.toUpperCase(), model: 'Details fetched at launch' }] })),
  requestGst: (s, clientId, g) => ({ ...s, gstRequests: [{ id: 'GST-' + (303 + s.gstRequests.length), clientId, ...g, at: now(), status: 'Requested' }, ...s.gstRequests] }),

  /* advocate */
  saveAdvocate: (s, id, p) => patchAdv(s, id, p),
  setDoc: (s, id, key, src) =>
    patchAdv(s, id, (a) => {
      const docs = { ...a.docs, [key]: { src, status: 'uploaded' } }
      const left = Object.values(docs).some((d) => d.status === 'reupload')
      return { docs, status: a.status === 'reupload' && !left ? 'pending' : a.status }
    }),
  submitVerification: (s, id) => notify(patchAdv(s, id, { status: 'pending', submittedAt: now() }), id, 'Documents submitted', 'Our team is checking your Bar Council documents.'),
  buyMembership(s, id, planId) {
    const plan = s.settings.plans.find((p) => p.id === planId)
    const a = advById(s, id)
    const start = now()
    const end = addMonths(a.membership && a.membership.end > start ? a.membership.end : start, plan.months)
    const memberId = a.membership?.memberId ?? 'VB-AD-' + String(500 + Math.floor(Math.random() * 400)).padStart(5, '0')
    s = patchAdv(s, id, { membership: { planId, start, end, memberId } })
    s = { ...s, tx: [{ id: uid('t'), at: start, kind: 'membership', ref: memberId, advocateId: id, amount: plan.price ? plan.price * (1 + s.settings.gst) : 0, gst: plan.price ? plan.price * s.settings.gst : 0, status: plan.price ? 'Captured' : 'Demo · price at launch' }, ...s.tx] }
    return notify(s, id, 'Membership active', plan.name + ' plan · member ID ' + memberId + '.')
  },
  acceptCase(s, id) {
    s = patchReq(s, id, { status: 'accepted', acceptedAt: now() })
    const r = s.requests.find((x) => x.id === id)
    const a = advById(s, r.advocateId)
    s = push(s, id, sysMsg('Adv. ' + a.name + ' accepted the request'))
    return notify(s, r.clientId, 'Advocate assigned', 'Adv. ' + a.name + ' will help you with ' + id + '.')
  },
  declineCase(s, id, reason) {
    const r = s.requests.find((x) => x.id === id)
    s = patchReq(s, id, (x) => ({ status: 'submitted', advocateId: undefined, assignedAt: undefined, declined: [...(x.declined ?? []), { advocateId: r.advocateId, reason, at: now() }] }))
    return push(s, id, sysMsg('The assigned advocate could not take this request. Our team is assigning another verified advocate.'))
  },
  sendQuote(s, id, fee, scope) {
    s = patchReq(s, id, { status: 'quoted', quote: { fee, scope, validTill: now() + 7 * DAY, at: now() } })
    const r = s.requests.find((x) => x.id === id)
    s = push(s, id, { id: uid('m'), from: 'advocate', kind: 'quote', quote: { fee, scope, validTill: now() + 7 * DAY }, at: now() })
    return notify(s, r.clientId, 'Fee quote received', inr(fee) + ' for request ' + id + '.')
  },
  markDone(s, id) {
    s = patchReq(s, id, { status: 'done', doneAt: now() })
    const r = s.requests.find((x) => x.id === id)
    s = push(s, id, sysMsg('The advocate marked the work as done. Confirm or raise a dispute within ' + s.settings.autoConfirmDays + ' days.'))
    return notify(s, r.clientId, 'Work marked as done', 'Please confirm request ' + id + ' or raise a dispute.')
  },
  requestWithdrawal(s, id, amount) {
    const a = advById(s, id)
    s = patchAdv(s, id, (x) => ({ wallet: x.wallet - amount }))
    return { ...s, withdrawals: [{ id: 'WD-' + (202 + s.withdrawals.length), advocateId: id, amount, to: a.bank?.upi || 'Bank ••' + (a.bank?.account ?? '').slice(-4), at: now(), status: 'requested' }, ...s.withdrawals] }
  },

  /* admin */
  assign(s, reqId, advocateId) {
    s = patchReq(s, reqId, { status: 'assigned', advocateId, assignedAt: now() })
    const r = s.requests.find((x) => x.id === reqId)
    return notify(s, advocateId, 'New request ' + reqId, categoryOf(r.category).name + ' · ' + r.district + '. Accept or decline.')
  },
  reviewAdvocate(s, id, decision, notes = {}) {
    // decision: 'approve' | 'reupload' | 'reject'
    const a = advById(s, id)
    const docs = {}
    Object.keys(a.docs).forEach((k) => {
      docs[k] = decision === 'approve' ? { ...a.docs[k], status: 'approved', note: undefined } : notes[k] ? { ...a.docs[k], status: 'reupload', note: notes[k] } : { ...a.docs[k], status: decision === 'reject' ? 'rejected' : 'approved' }
    })
    const status = decision === 'approve' ? 'approved' : decision
    s = patchAdv(s, id, { status, docs, reviewNote: notes._reason })
    const title = { approve: 'You are verified', reupload: 'Please retake ' + Object.keys(notes).filter((k) => k !== '_reason').length + ' document(s)', reject: 'Verification rejected' }[decision]
    return notify(s, id, title, decision === 'approve' ? 'Choose a membership to start receiving client requests.' : notes._reason || 'See the details on your verification page.')
  },
  setBlocked: (s, kind, id, blocked) => (kind === 'advocate' ? patchAdv(s, id, { blocked }) : patchClient(s, id, { blocked })),
  grantMembership: (s, id, planId) => act.buyMembership(s, id, planId),
  setWithdrawal(s, wid, status) {
    const w = s.withdrawals.find((x) => x.id === wid)
    s = { ...s, withdrawals: s.withdrawals.map((x) => (x.id === wid ? { ...x, status, utr: status === 'paid' ? 'UTR' + String(now()).slice(-6) : x.utr } : x)) }
    if (status === 'rejected') s = patchAdv(s, w.advocateId, (a) => ({ wallet: a.wallet + w.amount }))
    if (status === 'paid') s = { ...s, tx: [{ id: uid('t'), at: now(), kind: 'withdrawal', ref: wid, advocateId: w.advocateId, amount: -w.amount, gst: 0, status: 'Paid' }, ...s.tx] }
    return notify(s, w.advocateId, 'Withdrawal ' + status, inr(w.amount) + ' · ' + wid)
  },
  resolveDispute(s, id, outcome) {
    const r = s.requests.find((x) => x.id === id)
    if (outcome === 'release') {
      s = patchReq(s, id, (x) => ({ status: 'done', dispute: { ...x.dispute, status: 'released' } }))
      s = act.confirmRequest(s, id, 4, '')
      return push(s, id, sysMsg('Our team reviewed the dispute and released the payment to the advocate.'))
    }
    const pay = advocatePayout(r.paid.base, r.paid.rates ?? ratesFor(s, r.category))
    s = patchReq(s, id, (x) => ({ status: 'completed', completedAt: now(), dispute: { ...x.dispute, status: 'refunded' } }))
    s = patchAdv(s, r.advocateId, (a) => ({ hold: Math.max(0, a.hold - pay.net) }))
    s = { ...s, tx: [{ id: uid('t'), at: now(), kind: 'refund', ref: id, clientId: r.clientId, amount: -r.paid.total, gst: -r.paid.gst, status: 'Refunded' }, ...s.tx] }
    s = push(s, id, sysMsg('Our team reviewed the dispute and refunded ' + inr(r.paid.total) + ' to the client.'))
    return notify(s, r.clientId, 'Refund issued', inr(r.paid.total) + ' for ' + id + '.')
  },
  setSettings: (s, p) => ({ ...s, settings: { ...s.settings, ...p } }),
  setGstStatus: (s, id, status) => notify({ ...s, gstRequests: s.gstRequests.map((g) => (g.id === id ? { ...g, status } : g)) }, s.gstRequests.find((g) => g.id === id)?.clientId, 'GST filing ' + id, 'Status: ' + status),
  addEnquiry: (s, e) => ({ ...s, enquiries: [{ id: uid('e'), ...e, at: now() }, ...s.enquiries] }),
  readNotices: (s, userId) => ({ ...s, notices: { ...s.notices, [userId]: (s.notices[userId] ?? []).map((n) => ({ ...n, read: true })) } }),
}

/* ------------------------------------------------------------------ demo automation */

const GREETING = {
  criminal: 'Namaste. I have read your request. The first step is usually a bail application. Can you share the FIR or complaint copy?',
  civil: 'Namaste. Please share the agreement or property papers you have, so I can advise on the right notice.',
  matrimonial: 'Namaste. For mutual consent divorce we file one joint petition, then a 6-month cooling period that the court can waive. Do you have the marriage certificate?',
  accident: 'Namaste. Sorry to hear about the accident. Please share the FIR, medical bills and insurance details.',
  consumer: 'Namaste. Please share the invoice and any messages with the seller or builder.',
  notary: 'Namaste. Please share the details that should go in the affidavit.',
  other: 'Namaste. I have read your request. Let us discuss it here.',
}

export function tick(s) {
  const t = now()
  let n = s
  for (const r of s.requests) {
    const adv = advById(n, r.advocateId)
    const client = clientById(n, r.clientId)
    // Unassigned for a while and the admin is not around: assign a demo advocate.
    if (r.status === 'submitted' && n.settings.demoAuto && !client?.isDemo && t - r.createdAt > 15000) {
      const pick = n.advocates.find((a) => a.isDemo && a.status === 'approved' && membershipActive(a) && a.practice.includes(r.category) && !(r.declined ?? []).some((d) => d.advocateId === a.id)) ?? n.advocates.find((a) => a.isDemo && a.status === 'approved')
      if (pick) n = act.assign(n, r.id, pick.id)
      continue
    }
    if (!adv) continue
    if (adv.isDemo) {
      if (r.status === 'assigned' && t - r.assignedAt > 4000) {
        n = act.acceptCase(n, r.id)
        n = push(n, r.id, { id: uid('m'), from: 'advocate', kind: 'text', text: GREETING[r.category], at: t + 1 })
      } else if (r.status === 'accepted' && t - (r.acceptedAt ?? t) > 7000) {
        const cat = categoryOf(r.category)
        n = act.sendQuote(n, r.id, cat.demoFee, cat.demoScope)
      } else if (r.status === 'paid' && !client?.isDemo && t - r.paid.at > 25000) {
        n = push(n, r.id, { id: uid('m'), from: 'advocate', kind: 'text', text: 'The work is complete. Please confirm so the payment is released.', at: t })
        n = act.markDone(n, r.id)
      }
    }
    if (client?.isDemo && !adv.isDemo) {
      if (r.status === 'quoted' && t - r.quote.at > 10000) n = act.payRequest(n, r.id, { useOffer: false, useWallet: false })
      else if (r.status === 'done' && t - r.doneAt > 12000) n = act.confirmRequest(n, r.id, 5, 'Very helpful.')
    }
  }
  // Canned replies from demo advocates.
  for (const r of n.requests) {
    const adv = advById(n, r.advocateId)
    if (!adv?.isDemo || ['completed', 'submitted', 'assigned'].includes(r.status)) continue
    const list = n.chats[r.id] ?? []
    const last = list[list.length - 1]
    if (last && last.from === 'client' && t - last.at > 3000) n = push(n, r.id, { id: uid('m'), from: 'advocate', kind: 'text', text: ['Noted, thank you. I will review this.', 'Received. I will get back to you shortly.', 'Thank you, that helps.'][list.length % 3], at: t })
  }
  // Demo clients for your advocate: when the admin assigns a demo client's request to your account, it is new for you.
  return n
}

/* ------------------------------------------------------------------ provider */

const Ctx = createContext(null)

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const v = JSON.parse(raw)
      if (v?.v === 1) return v
    }
  } catch {
    /* fall through to a fresh seed */
  }
  return seed()
}

export function StoreProvider({ children }) {
  const [s, setS] = useState(load)
  const ref = useRef(s)
  ref.current = s

  const update = useCallback((fn) => {
    const next = fn(ref.current)
    if (next === ref.current) return next
    ref.current = next
    setS(next)
    try {
      localStorage.setItem(KEY, JSON.stringify(next))
    } catch {
      alert('This browser is out of demo storage. Use "Reset demo data" in the admin panel settings.')
    }
    return next
  }, [])

  // Other tabs (admin <-> portals) see changes immediately.
  useEffect(() => {
    const on = (e) => {
      if (e.key === KEY && e.newValue) {
        const v = JSON.parse(e.newValue)
        ref.current = v
        setS(v)
      }
    }
    window.addEventListener('storage', on)
    return () => window.removeEventListener('storage', on)
  }, [])

  // Only the visible tab runs the demo timers, so two tabs never double-act.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') update(tick)
    }, 2000)
    return () => clearInterval(t)
  }, [update])

  const reset = useCallback(() => {
    localStorage.removeItem(KEY)
    const fresh = seed()
    ref.current = fresh
    setS(fresh)
    localStorage.setItem(KEY, JSON.stringify(fresh))
  }, [])

  return <Ctx.Provider value={{ s, update, reset }}>{children}</Ctx.Provider>
}

export function useStore() {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore outside StoreProvider')
  return c
}

/** Resize an image file to a JPEG data URL so it fits the demo storage. */
export function fileToDataUrl(file, max = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height))
      const c = document.createElement('canvas')
      c.width = Math.round(img.width * k)
      c.height = Math.round(img.height * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.72))
      URL.revokeObjectURL(img.src)
    }
    img.onerror = reject
    img.src = URL.createObjectURL(file)
  })
}

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key)
