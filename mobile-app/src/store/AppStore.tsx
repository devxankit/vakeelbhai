import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  advocateFor,
  AUTO_CONFIRM_DAYS,
  CategoryKey,
  categoryOf,
  CHALLANS,
  DocKey,
  PAID_CHALLANS_SEED,
  PLANS,
} from '../data/catalog';
import { advocatePayout, clientBill, DEFAULT_RATES, inr } from '../utils/money';
import { LangCode, setLang as setI18nLang } from '../i18n';
import { DAY } from '../utils/format';

/**
 * One store for the UI-only phase, saved on the device. Things the admin or
 * the other party would do (assign an advocate, send a quote, pay, mark done,
 * confirm) are simulated by DEMO TIMERS in `tick()`, driven by timestamps so
 * they survive an app restart. The backend phase replaces them with the API
 * and live updates; the screens stay the same.
 */

export type Role = 'client' | 'advocate';

export type Msg = {
  id: string;
  from: 'me' | 'them' | 'system';
  kind: 'text' | 'quote' | 'file' | 'image';
  text?: string;
  quote?: { fee: number; scope: string; validTill: number };
  file?: { name: string; size: string };
  uri?: string;
  at: number;
};

export type ReqStatus = 'submitted' | 'assigned' | 'quoted' | 'paid' | 'done' | 'completed' | 'disputed';

export type ClientRequest = {
  id: string;
  category: CategoryKey;
  issue: string;
  district: string;
  lang: string;
  docs: string[];
  createdAt: number;
  status: ReqStatus;
  advocateId?: string;
  assignedAt?: number;
  quote?: { fee: number; scope: string; validTill: number; at: number };
  paid?: { fee: number; discount: number; base: number; gst: number; wallet: number; total: number; at: number; offer?: string };
  doneAt?: number;
  completedAt?: number;
  rating?: number;
  review?: string;
  dispute?: string;
};

export type CaseStatus = 'new' | 'accepted' | 'quoted' | 'paid' | 'done' | 'completed' | 'declined';

export type AdvCase = {
  id: string;
  category: CategoryKey;
  title: string;
  issue: string;
  clientName: string;
  clientPhoto: 'gurpreet' | 'ananya' | 'none';
  district: string;
  lang: string;
  assignedAt: number;
  status: CaseStatus;
  quote?: { fee: number; scope: string; at: number };
  paidAt?: number;
  doneAt?: number;
  completedAt?: number;
  declineReason?: string;
};

export type WalletTx = {
  id: string;
  type: 'earn' | 'hold' | 'withdraw' | 'fee' | 'referral' | 'cashback' | 'spend' | 'refund';
  title: string;
  sub: string;
  amount: number;
  at: number;
  status?: string;
  lines?: { k: string; v: string }[];
};

export type Notice = { id: string; title: string; body: string; at: number; read?: boolean };

export type DocState = { uri?: string; status: 'missing' | 'uploaded' | 'approved' | 'reupload'; note?: string };

export type GstRequest = { id: string; gstin: string; returnType: string; period: string; note: string; at: number; status: 'Requested' | 'In review' | 'Documents needed' | 'Filed' };

export type State = {
  v: 1;
  lang: LangCode;
  langChosen: boolean;
  introSeen: boolean;
  role: Role | null;
  phone: string;
  loggedIn: boolean;
  client: {
    name: string;
    email: string;
    city: string;
    state: string;
    referralCode: string;
    referredBy: string;
    wallet: number;
    walletTx: WalletTx[];
    vehicles: { number: string; model: string }[];
    paidChallans: { id: string; vehicle: string; offence: string; amount: number; paidOn: string; receipt: string }[];
    gst: GstRequest[];
    usedFirst10: boolean;
    seeded: boolean;
  };
  requests: ClientRequest[];
  advocate: {
    name: string;
    email: string;
    address: string;
    state: string;
    district: string;
    practice: CategoryKey[];
    years: string;
    courts: string;
    enrolment: string;
    photo?: string;
    docs: Record<string, DocState>;
    verification: 'none' | 'pending' | 'reupload' | 'approved';
    submittedAt?: number;
    membership: { planId: string; start: number; end: number; memberId: string } | null;
    wallet: number;
    hold: number;
    lifetime: number;
    tx: WalletTx[];
    bank: { holder: string; account: string; ifsc: string; upi: string } | null;
    rating: number;
    seeded: boolean;
  };
  cases: AdvCase[];
  chats: Record<string, Msg[]>;
  notices: Notice[];
};

const blankAdvocate = (): State['advocate'] => ({
  name: '',
  email: '',
  address: '',
  state: 'Madhya Pradesh',
  district: 'Indore',
  practice: [],
  years: '',
  courts: '',
  enrolment: '',
  docs: {},
  verification: 'none',
  membership: null,
  wallet: 0,
  hold: 0,
  lifetime: 0,
  tx: [],
  bank: null,
  rating: 0,
  seeded: false,
});

const blankClient = (): State['client'] => ({
  name: '',
  email: '',
  city: 'Indore',
  state: 'Madhya Pradesh',
  referralCode: '',
  referredBy: '',
  wallet: 0,
  walletTx: [],
  vehicles: [],
  paidChallans: [],
  gst: [],
  usedFirst10: false,
  seeded: false,
});

const initial: State = {
  v: 1,
  lang: 'en',
  langChosen: false,
  introSeen: false,
  role: null,
  phone: '',
  loggedIn: false,
  client: blankClient(),
  requests: [],
  advocate: blankAdvocate(),
  cases: [],
  chats: {},
  notices: [],
};

const KEY = 'vakeelbhai.state.v1';
let seq = 0;
export const uid = (p = '') => p + Date.now().toString(36) + (seq++).toString(36);
const reqNo = () => 'VB-' + (1040 + Math.floor(Math.random() * 900));

/* ---------- demo timing (seconds) ---------- */
const T_ASSIGN = 6;
const T_QUOTE = 8;
const T_ADV_DONE = 25;
const T_CLIENT_PAYS = 10;
const T_CLIENT_CONFIRMS = 12;

function sys(text: string, at = Date.now()): Msg {
  return { id: uid('m'), from: 'system', kind: 'text', text, at };
}

type Ctx = {
  s: State;
  ready: boolean;
  set: (fn: (s: State) => State) => void;
  /* session */
  chooseLang: (l: LangCode) => void;
  seeIntro: () => void;
  chooseRole: (r: Role) => void;
  login: (phone: string) => void;
  logout: () => void;
  deleteAccount: () => void;
  /* client */
  saveClientProfile: (p: Partial<State['client']>) => void;
  submitRequest: (r: { category: CategoryKey; issue: string; district: string; lang: string; docs: string[] }) => string;
  sendMessage: (chatId: string, m: Partial<Msg>) => void;
  payRequest: (id: string, o: { useOffer: boolean; useWallet: boolean }) => void;
  confirmRequest: (id: string, rating: number, review: string) => void;
  disputeRequest: (id: string, reason: string) => void;
  payChallans: (ids: string[]) => string;
  addVehicle: (number: string) => void;
  requestGst: (g: Omit<GstRequest, 'id' | 'at' | 'status'>) => void;
  /* advocate */
  saveAdvocate: (p: Partial<State['advocate']>) => void;
  setDoc: (key: DocKey, uri: string) => void;
  submitVerification: () => void;
  demoVerify: (outcome: 'approve' | 'reupload') => void;
  buyMembership: (planId: string) => void;
  acceptCase: (id: string) => void;
  declineCase: (id: string, reason: string) => void;
  sendQuote: (id: string, fee: number, scope: string) => void;
  markDone: (id: string) => void;
  withdraw: (amount: number) => void;
  saveBank: (b: NonNullable<State['advocate']['bank']>) => void;
  readNotices: () => void;
};

const AppCtx = createContext<Ctx | null>(null);

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [s, setS] = useState<State>(initial);
  const [ready, setReady] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(raw => {
        if (raw) {
          try {
            const saved = JSON.parse(raw) as State;
            if (saved.v === 1) {
              setI18nLang(saved.lang);
              setS({ ...initial, ...saved, client: { ...blankClient(), ...saved.client }, advocate: { ...blankAdvocate(), ...saved.advocate } });
            }
          } catch {}
        }
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      AsyncStorage.setItem(KEY, JSON.stringify(s)).catch(() => {});
    }, 400);
  }, [s, ready]);

  const set = useCallback((fn: (st: State) => State) => setS(fn), []);

  /* ---------- demo ticker ---------- */
  useEffect(() => {
    if (!ready) return;
    const t = setInterval(() => setS(tick), 2000);
    return () => clearInterval(t);
  }, [ready]);

  const api = useMemo<Ctx>(() => {
    const notify = (st: State, title: string, body: string): State => ({
      ...st,
      notices: [{ id: uid('n'), title, body, at: Date.now() }, ...st.notices].slice(0, 50),
    });

    return {
      s,
      ready,
      set,
      chooseLang: l => {
        setI18nLang(l);
        setS(st => ({ ...st, lang: l, langChosen: true }));
      },
      seeIntro: () => setS(st => ({ ...st, introSeen: true })),
      chooseRole: r => setS(st => ({ ...st, role: r })),
      login: phone =>
        setS(st => {
          let next: State = { ...st, phone, loggedIn: true };
          if (st.role === 'client' && !st.client.seeded) next = seedClient(next);
          return next;
        }),
      logout: () => setS(st => ({ ...st, loggedIn: false, role: null })),
      deleteAccount: () => {
        AsyncStorage.removeItem(KEY).catch(() => {});
        setS(st => ({ ...initial, lang: st.lang, langChosen: true, introSeen: true }));
      },

      saveClientProfile: p =>
        setS(st => ({
          ...st,
          client: {
            ...st.client,
            ...p,
            referralCode: st.client.referralCode || 'VB' + (p.name || st.client.name || 'USER').replace(/[^A-Za-z]/g, '').slice(0, 5).toUpperCase() + String(Math.floor(100 + Math.random() * 900)),
          },
        })),

      submitRequest: r => {
        const id = reqNo();
        setS(st =>
          notify(
            {
              ...st,
              requests: [{ id, ...r, createdAt: Date.now(), status: 'submitted' }, ...st.requests],
              chats: { ...st.chats, [id]: [sys('Request submitted. Our team will assign a verified advocate.')] },
            },
            'Request ' + id + ' received',
            'We are finding a verified ' + categoryOf(r.category).name.toLowerCase() + ' in ' + r.district + '.',
          ),
        );
        return id;
      },

      sendMessage: (chatId, m) =>
        setS(st => {
          const msg: Msg = { id: uid('m'), from: 'me', kind: 'text', at: Date.now(), ...m } as Msg;
          const list = [...(st.chats[chatId] ?? []), msg];
          return { ...st, chats: { ...st.chats, [chatId]: list } };
        }),

      payRequest: (id, o) =>
        setS(st => {
          const r = st.requests.find(x => x.id === id);
          if (!r || !r.quote) return st;
          const cat = categoryOf(r.category);
          const discount = o.useOffer && !st.client.usedFirst10 ? Math.min(r.quote.fee * 0.1, 500) : 0;
          const bill = clientBill(r.quote.fee, { discount, gstOnService: cat.gstOnService, wallet: o.useWallet ? st.client.wallet : 0 });
          const tx: WalletTx[] = bill.wallet
            ? [{ id: uid('t'), type: 'spend', title: 'Used for request ' + id, sub: cat.name, amount: -bill.wallet, at: Date.now() }]
            : [];
          let next: State = {
            ...st,
            client: {
              ...st.client,
              wallet: st.client.wallet - bill.wallet,
              walletTx: [...tx, ...st.client.walletTx],
              usedFirst10: st.client.usedFirst10 || discount > 0,
            },
            requests: st.requests.map(x => (x.id === id ? { ...x, status: 'paid', paid: { ...bill, at: Date.now(), offer: discount ? 'FIRST10' : undefined } } : x)),
            chats: { ...st.chats, [id]: [...(st.chats[id] ?? []), sys('Payment of ' + inr(bill.total) + ' received. It is held safely until you confirm the work is done.')] },
          };
          next = notify(next, 'Payment successful', inr(bill.total) + ' paid for request ' + id + '. GST invoice sent to your email.');
          return next;
        }),

      confirmRequest: (id, rating, review) =>
        setS(st => {
          const r = st.requests.find(x => x.id === id);
          let next: State = {
            ...st,
            requests: st.requests.map(x => (x.id === id ? { ...x, status: 'completed', completedAt: Date.now(), rating, review } : x)),
            chats: { ...st.chats, [id]: [...(st.chats[id] ?? []), sys('You confirmed the work is done. Thank you for using Vakeel Bhai.')] },
          };
          // Referral reward: the first paid service of a referred client credits the referrer (simulated as cashback here).
          if (r && r.category === 'notary') {
            next = {
              ...next,
              client: {
                ...next.client,
                wallet: next.client.wallet + 100,
                walletTx: [{ id: uid('t'), type: 'cashback', title: 'Cashback · NOTARY100', sub: 'Request ' + id, amount: 100, at: Date.now() }, ...next.client.walletTx],
              },
            };
          }
          return next;
        }),

      disputeRequest: (id, reason) =>
        setS(st =>
          notify(
            {
              ...st,
              requests: st.requests.map(x => (x.id === id ? { ...x, status: 'disputed', dispute: reason } : x)),
              chats: { ...st.chats, [id]: [...(st.chats[id] ?? []), sys('Dispute raised. Our team will contact you in this chat within 24 hours. The payment stays on hold.')] },
            },
            'Dispute raised',
            'Request ' + id + ' is with our team. The payment stays on hold.',
          ),
        ),

      payChallans: ids => {
        const receipt = 'VBC' + Date.now().toString().slice(-8);
        setS(st => {
          const paidOn = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
          const add = CHALLANS.filter(c => ids.includes(c.id)).map(c => ({ id: c.id, vehicle: c.vehicle, offence: c.offence, amount: c.amount, paidOn, receipt }));
          const total = add.reduce((a, c) => a + c.amount, 0);
          return notify({ ...st, client: { ...st.client, paidChallans: [...add, ...st.client.paidChallans] } }, 'e-Challan paid', inr(total) + ' paid for ' + add.length + ' challan(s). Receipt ' + receipt + '.');
        });
        return receipt;
      },

      addVehicle: number =>
        setS(st => ({
          ...st,
          client: { ...st.client, vehicles: [...st.client.vehicles, { number: number.toUpperCase(), model: 'Vehicle details fetched at launch' }] },
        })),

      requestGst: g =>
        setS(st =>
          notify(
            { ...st, client: { ...st.client, gst: [{ ...g, id: 'GST-' + (300 + st.client.gst.length + 1), at: Date.now(), status: 'Requested' }, ...st.client.gst] } },
            'GST filing request received',
            'Our team will review your documents and reply in the app.',
          ),
        ),

      saveAdvocate: p => setS(st => ({ ...st, advocate: { ...st.advocate, ...p } })),

      setDoc: (key, uri) =>
        setS(st => {
          const docs = { ...st.advocate.docs, [key]: { uri, status: 'uploaded' as const } };
          // After the last requested retake, the profile goes back to the admin for review.
          const retakesLeft = Object.values(docs).some(d => d.status === 'reupload');
          const verification = st.advocate.verification === 'reupload' && !retakesLeft ? 'pending' : st.advocate.verification;
          return { ...st, advocate: { ...st.advocate, docs, verification } };
        }),

      submitVerification: () =>
        setS(st =>
          notify(
            { ...st, advocate: { ...st.advocate, verification: 'pending', submittedAt: Date.now() } },
            'Documents submitted',
            'Our team is checking your Bar Council documents. This usually takes 12 to 24 hours.',
          ),
        ),

      demoVerify: outcome =>
        setS(st => {
          if (outcome === 'reupload') {
            return notify(
              {
                ...st,
                advocate: {
                  ...st.advocate,
                  verification: 'reupload',
                  docs: {
                    ...st.advocate.docs,
                    districtBar: { ...(st.advocate.docs.districtBar ?? { status: 'uploaded' }), status: 'approved' },
                    aadhaarBack: { ...(st.advocate.docs.aadhaarBack ?? {}), status: 'reupload', note: 'The address is blurred. Please retake in good light.' },
                  },
                },
              },
              '1 document needs a retake',
              'Aadhaar (back): the address is blurred.',
            );
          }
          const docs: Record<string, DocState> = {};
          Object.keys(st.advocate.docs).forEach(k => (docs[k] = { ...st.advocate.docs[k], status: 'approved', note: undefined }));
          return notify({ ...st, advocate: { ...st.advocate, verification: 'approved', docs } }, 'You are verified', 'Choose a membership to start receiving client requests.');
        }),

      buyMembership: planId =>
        setS(st => {
          const plan = PLANS.find(p => p.id === planId) ?? PLANS[2];
          const start = Date.now();
          const base = st.advocate.membership && st.advocate.membership.end > start ? st.advocate.membership.end : start;
          const endDate = new Date(base);
          endDate.setMonth(endDate.getMonth() + plan.months);
          const end = endDate.getTime();
          const memberId = st.advocate.membership?.memberId ?? 'VB-AD-' + String(400 + Math.floor(Math.random() * 500)).padStart(5, '0');
          let next: State = {
            ...st,
            advocate: {
              ...st.advocate,
              membership: { planId, start, end, memberId },
              tx: [
                { id: uid('t'), type: 'fee', title: plan.name + ' membership', sub: 'Invoice ' + memberId + '/' + new Date().getFullYear(), amount: 0, at: start, status: plan.price ? 'incl. 18% GST' : 'Demo · price at launch' },
                ...st.advocate.tx,
              ],
            },
          };
          if (!st.advocate.seeded) next = seedAdvocate(next);
          return notify(next, 'Membership active', plan.name + ' plan · member ID ' + memberId + '. New client requests will appear on your dashboard.');
        }),

      acceptCase: id =>
        setS(st => ({
          ...st,
          cases: st.cases.map(c => (c.id === id ? { ...c, status: 'accepted' } : c)),
          chats: {
            ...st.chats,
            ['case:' + id]: [
              ...(st.chats['case:' + id] ?? []),
              sys('You accepted this request. Introduce yourself and send a fee quote.'),
            ],
          },
        })),

      declineCase: (id, reason) =>
        setS(st => ({ ...st, cases: st.cases.map(c => (c.id === id ? { ...c, status: 'declined', declineReason: reason } : c)) })),

      sendQuote: (id, fee, scope) =>
        setS(st => ({
          ...st,
          cases: st.cases.map(c => (c.id === id ? { ...c, status: 'quoted', quote: { fee, scope, at: Date.now() } } : c)),
          chats: {
            ...st.chats,
            ['case:' + id]: [...(st.chats['case:' + id] ?? []), { id: uid('m'), from: 'me', kind: 'quote', quote: { fee, scope, validTill: Date.now() + 7 * DAY }, at: Date.now() }],
          },
        })),

      markDone: id =>
        setS(st => ({
          ...st,
          cases: st.cases.map(c => (c.id === id ? { ...c, status: 'done', doneAt: Date.now() } : c)),
          chats: {
            ...st.chats,
            ['case:' + id]: [...(st.chats['case:' + id] ?? []), sys('You marked the work as done. The client has ' + AUTO_CONFIRM_DAYS + ' days to confirm, then it confirms automatically.')],
          },
        })),

      withdraw: amount =>
        setS(st =>
          notify(
            {
              ...st,
              advocate: {
                ...st.advocate,
                wallet: st.advocate.wallet - amount,
                tx: [
                  {
                    id: uid('t'),
                    type: 'withdraw',
                    title: 'Withdrawal',
                    sub: 'To ' + (st.advocate.bank?.upi || 'bank ••' + (st.advocate.bank?.account ?? '').slice(-4)),
                    amount: -amount,
                    at: Date.now(),
                    status: 'Requested · admin approves',
                  },
                  ...st.advocate.tx,
                ],
              },
            },
            'Withdrawal requested',
            inr(amount) + ' will reach your account after admin approval.',
          ),
        ),

      saveBank: b => setS(st => ({ ...st, advocate: { ...st.advocate, bank: b } })),
      readNotices: () => setS(st => ({ ...st, notices: st.notices.map(n => ({ ...n, read: true })) })),
    };
  }, [s, ready, set]);

  return <AppCtx.Provider value={api}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppStoreProvider');
  return c;
}

/* ---------- demo simulation ---------- */

const ADV_GREETING: Record<string, string> = {
  criminal: 'Namaste. I have read your request. In matters like this, the first step is usually a bail application. Can you share the FIR or complaint copy?',
  civil: 'Namaste. I have read your request. Please share the agreement or property papers you have, so I can advise on the right notice.',
  matrimonial: 'Namaste. I have read your request. For mutual consent divorce we file one joint petition, then there is a 6-month cooling period that the court can waive. Do you have the marriage certificate?',
  accident: 'Namaste. Sorry to hear about the accident. Please share the FIR, medical bills and insurance details so I can file the claim.',
  consumer: 'Namaste. I have read your complaint. Please share the invoice and any messages with the seller or builder.',
  notary: 'Namaste. Please share the details that should go in the affidavit. I can have it notarised this week.',
  other: 'Namaste. I have read your request. Let us discuss it here and I will advise on the next steps.',
};

const CANNED = ['Noted, thank you. I will review this.', 'Received. I will get back to you shortly.', 'Thank you. That helps.'];

export function tick(st: State): State {
  const now = Date.now();
  let changed = false;
  let next: State = st;
  const push = (chatId: string, m: Msg) => {
    next = { ...next, chats: { ...next.chats, [chatId]: [...(next.chats[chatId] ?? []), m] } };
  };
  const notice = (title: string, body: string) => {
    next = { ...next, notices: [{ id: uid('n'), title, body, at: now }, ...next.notices].slice(0, 50) };
  };

  // Client side: admin assigns, advocate quotes, advocate marks done.
  const requests = st.requests.map(r => {
    if (r.status === 'submitted' && now - r.createdAt > T_ASSIGN * 1000) {
      changed = true;
      const adv = advocateFor(r.category);
      push(r.id, sys(adv.name + ' accepted your request', now));
      push(r.id, { id: uid('m'), from: 'them', kind: 'text', text: ADV_GREETING[r.category], at: now + 1 });
      notice('Advocate assigned', adv.name + ' will help you with request ' + r.id + '.');
      return { ...r, status: 'assigned' as ReqStatus, advocateId: adv.id, assignedAt: now };
    }
    if (r.status === 'assigned' && r.assignedAt && now - r.assignedAt > T_QUOTE * 1000) {
      changed = true;
      const cat = categoryOf(r.category);
      const quote = { fee: cat.demoFee, scope: cat.demoScope, validTill: now + 7 * DAY };
      push(r.id, { id: uid('m'), from: 'them', kind: 'quote', quote, at: now });
      notice('Fee quote received', inr(quote.fee) + ' for request ' + r.id + '. Review and pay in the chat.');
      return { ...r, status: 'quoted' as ReqStatus, quote: { ...quote, at: now } };
    }
    if (r.status === 'paid' && r.paid && now - r.paid.at > T_ADV_DONE * 1000) {
      changed = true;
      push(r.id, { id: uid('m'), from: 'them', kind: 'text', text: 'The work is complete. Please confirm in the app so the payment is released.', at: now });
      push(r.id, sys('Advocate marked the work as done. Confirm or raise a dispute within ' + AUTO_CONFIRM_DAYS + ' days.', now + 1));
      notice('Work marked as done', 'Please confirm request ' + r.id + ' or raise a dispute.');
      return { ...r, status: 'done' as ReqStatus, doneAt: now };
    }
    return r;
  });

  // Canned reply to the client's latest message.
  for (const r of requests) {
    if (!r.advocateId || r.status === 'completed') continue;
    const list = next.chats[r.id] ?? [];
    const last = list[list.length - 1];
    if (last && last.from === 'me' && now - last.at > 3000) {
      changed = true;
      push(r.id, { id: uid('m'), from: 'them', kind: 'text', text: CANNED[list.length % CANNED.length], at: now });
    }
  }

  // Advocate side: client pays the quote, client confirms after done.
  let adv = next.advocate;
  const cases = st.cases.map(c => {
    if (c.status === 'quoted' && c.quote && now - c.quote.at > T_CLIENT_PAYS * 1000) {
      changed = true;
      const pay = advocatePayout(c.quote.fee);
      adv = { ...adv, hold: adv.hold + pay.net };
      push('case:' + c.id, sys(c.clientName + ' paid ' + inr(c.quote.fee) + '. ' + inr(pay.net) + ' is on hold for you until the client confirms.', now));
      notice('Client paid', c.clientName + ' paid your quote for ' + c.id + '. Start the work.');
      return { ...c, status: 'paid' as CaseStatus, paidAt: now };
    }
    if (c.status === 'done' && c.quote && c.doneAt && now - c.doneAt > T_CLIENT_CONFIRMS * 1000) {
      changed = true;
      const pay = advocatePayout(c.quote.fee, DEFAULT_RATES);
      adv = {
        ...adv,
        hold: Math.max(0, adv.hold - pay.net),
        wallet: adv.wallet + pay.net,
        lifetime: adv.lifetime + pay.net,
        tx: [
          {
            id: uid('t'),
            type: 'earn',
            title: 'Case ' + c.id + ' · ' + categoryOf(c.category).short,
            sub: c.clientName + ' · confirmed',
            amount: pay.net,
            at: now,
            status: 'Credited',
            lines: [
              { k: 'Client paid', v: inr(pay.base) },
              { k: 'Platform commission 20%', v: '−' + inr(pay.commission) },
              { k: 'GST on commission 18%', v: '−' + inr(pay.gstOnCommission) },
            ],
          },
          ...adv.tx,
        ],
      };
      push('case:' + c.id, sys(c.clientName + ' confirmed the work. ' + inr(pay.net) + ' was credited to your wallet.', now));
      notice('Payment credited', inr(pay.net) + ' for case ' + c.id + ' is in your wallet.');
      return { ...c, status: 'completed' as CaseStatus, completedAt: now };
    }
    return c;
  });

  if (!changed) return st;
  return { ...next, requests, cases, advocate: adv };
}

/* ---------- first-login history so the demo doesn't open on empty screens ---------- */

function seedClient(st: State): State {
  const now = Date.now();
  return {
    ...st,
    client: {
      ...st.client,
      seeded: true,
      wallet: 150,
      walletTx: [{ id: uid('t'), type: 'referral', title: 'Referral reward', sub: 'Your friend Rahul completed a first paid service', amount: 150, at: now - 3 * DAY }],
      vehicles: [{ number: 'MP 09 AB 1234', model: 'Hyundai i20 · Petrol' }],
      paidChallans: PAID_CHALLANS_SEED.map(c => ({ ...c, receipt: 'VBC' + c.id.slice(-6) })),
    },
  };
}

function seedAdvocate(st: State): State {
  const now = Date.now();
  const earn = (id: string, cat: CategoryKey, client: string, fee: number, daysAgo: number): WalletTx => {
    const p = advocatePayout(fee);
    return {
      id: uid('t'),
      type: 'earn',
      title: 'Case ' + id + ' · ' + categoryOf(cat).short,
      sub: client + ' · confirmed',
      amount: p.net,
      at: now - daysAgo * DAY,
      status: 'Credited',
      lines: [
        { k: 'Client paid', v: inr(p.base) },
        { k: 'Platform commission 20%', v: '−' + inr(p.commission) },
        { k: 'GST on commission 18%', v: '−' + inr(p.gstOnCommission) },
      ],
    };
  };
  const history = [earn('VB-1019', 'civil', 'Ananya K.', 4500, 2), earn('VB-0988', 'criminal', 'Mahesh P.', 12000, 9), earn('VB-0951', 'consumer', 'Farhan A.', 3500, 15)];
  const credited = history.reduce((a, t) => a + t.amount, 0);
  return {
    ...st,
    advocate: {
      ...st.advocate,
      seeded: true,
      wallet: credited,
      lifetime: credited,
      rating: 4.7,
      tx: [...st.advocate.tx, ...history],
    },
    cases: [
      {
        id: 'VB-1057',
        category: 'criminal',
        title: 'Bail for a family member arrested yesterday',
        issue: 'My brother was arrested in a cheque bounce matter. Hearing is likely this week. Need urgent help.',
        clientName: 'Rakesh Y.',
        clientPhoto: 'none',
        district: st.advocate.district || 'Indore',
        lang: 'Hindi',
        assignedAt: now - 12 * 60 * 1000,
        status: 'new',
      },
      {
        id: 'VB-1031',
        category: 'consumer',
        title: 'Refund for a defective car',
        issue: 'The dealer refuses to replace a car with a faulty gearbox bought 4 months ago.',
        clientName: 'Gurpreet S.',
        clientPhoto: 'gurpreet',
        district: 'Indore',
        lang: 'English',
        assignedAt: now - 2 * DAY,
        status: 'accepted',
      },
      {
        id: 'VB-1019',
        category: 'civil',
        title: 'Rent agreement dispute',
        issue: 'Landlord is holding back my security deposit of ₹60,000 after I moved out.',
        clientName: 'Ananya K.',
        clientPhoto: 'ananya',
        district: 'Indore',
        lang: 'Hindi',
        assignedAt: now - 9 * DAY,
        status: 'completed',
        quote: { fee: 4500, scope: 'Legal notice to the landlord and follow-up.', at: now - 8 * DAY },
        completedAt: now - 2 * DAY,
      },
    ],
    chats: {
      ...st.chats,
      'case:VB-1031': [
        sys('You accepted this request.', now - 2 * DAY),
        { id: uid('m'), from: 'them', kind: 'text', text: 'Sir, I have the invoice and 3 job cards from the service centre. What should I send?', at: now - 2 * DAY + 60000 },
      ],
      'case:VB-1019': [sys('This case is complete. ₹3,438 was credited to your wallet.', now - 2 * DAY)],
    },
  };
}
