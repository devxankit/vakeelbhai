import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, clearTokens, loadTokens, onSignedOut, refresh, verifyOtp } from '../api/client';
import { loadApiUrl } from '../api/config';
import { closeLive, useLive } from '../api/live';
import { CategoryKey, DocKey } from '../data/catalog';
import { LangCode, setLang as setI18nLang } from '../i18n';

/**
 * App state. Everything about requests, cases, wallets, challans and support lives on the
 * server and is loaded by each screen through the API (src/api). This store only keeps:
 *   - device preferences: language, intro seen, chosen role (saved on the phone)
 *   - the session: logged-in user, and their profile (`me`) from the API
 *   - /api/meta: categories, plans and admin settings
 *   - the unread notification count (live)
 */

export type Role = 'client' | 'advocate';

/* ---------- API shapes used by the screens ---------- */

export type PublicUser = { id: string; phone: string; role: Role; status: string; name: string; email: string };

export type ClientMe = { kind: 'client'; user: PublicUser; city: string; state: string; complete: boolean };

export type DocView = { key: DocKey; title: string; status: 'missing' | 'uploaded' | 'approved' | 'reupload' | 'rejected'; note: string | null; uploadedAt: string | null; version: number };

export type AdvocateMe = {
  kind: 'advocate';
  user: PublicUser;
  address: string;
  state: string;
  district: string;
  practice: CategoryKey[];
  experienceYears: number | null;
  courts: string;
  enrolmentNumber: string;
  hasPhoto: boolean;
  verification: { status: 'draft' | 'pending' | 'reupload' | 'approved' | 'rejected'; submittedAt: string | null; reviewedAt: string | null; reason: string | null };
  documents: DocView[];
  missing: string[];
  membership: { active: boolean; planName: string; memberId: string; startAt: string; endAt: string } | null;
};

export type Me = ClientMe | AdvocateMe;

export type MetaCategory = { key: string; name: string; short: string; covers: string; gstOnService?: boolean };
export type Plan = { id: string; name: string; note: string; months: number; price: number | null; best: boolean; benefits: string[] };
export type Meta = {
  categories: MetaCategory[];
  plans: Plan[];
  rates: { commission: number; gst: number };
  autoConfirmDays: number;
  quoteValidityDays: number;
  supportWhatsApp: string;
  referralOn: boolean;
  challan: { fee: number | null; payWithinHours: number; lookup: boolean; vehicleTypes: string[] };
  supportTopics: string[];
  gstReturnTypes: string[];
  referral: { rewardType: 'flat' | 'percent'; reward: number | null } | null;
};

/** Request status in the client's words (server toClientStatus). */
export type ReqStatus = 'submitted' | 'assigned' | 'quoted' | 'paid' | 'done' | 'completed' | 'disputed' | 'refunded' | 'cancelled';
/** Case status in the advocate's words (server toCaseStatus). */
export type CaseStatus = 'new' | 'accepted' | 'quoted' | 'paid' | 'done' | 'completed' | 'declined' | 'disputed' | 'refunded';

export type Msg = { id: string; from: 'client' | 'advocate' | 'system'; kind: 'text' | 'image' | 'quote'; text: string | null; hasFile: boolean; quote: { fee: number; scope: string; validTill: string } | null; at: string };

type Prefs = { v: 2; lang: LangCode; langChosen: boolean; introSeen: boolean; role: Role | null };
const PREFS_KEY = 'vakeelbhai.prefs.v2';
const initialPrefs: Prefs = { v: 2, lang: 'en', langChosen: false, introSeen: false, role: null };

type Ctx = {
  prefs: Prefs;
  ready: boolean;
  user: PublicUser | null;
  me: Me | null;
  meta: Meta | null;
  unread: number;
  chooseLang: (l: LangCode) => void;
  seeIntro: () => void;
  chooseRole: (r: Role) => void;
  /** After the OTP is verified: loads the profile. */
  login: (phone: string, otp: string) => Promise<{ isNew: boolean }>;
  logout: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  reloadMe: () => Promise<Me | null>;
  reloadMeta: () => Promise<void>;
  setUnread: (n: number) => void;
};

const AppCtx = createContext<Ctx | null>(null);

async function fetchMe(role: Role): Promise<Me> {
  if (role === 'client') return { kind: 'client', ...(await api('/client/profile')).data };
  return { kind: 'advocate', ...(await api('/advocate/profile')).data };
}

export function AppStoreProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<PublicUser | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [unread, setUnread] = useState(0);

  const savePrefs = useCallback((fn: (p: Prefs) => Prefs) => {
    setPrefs(p => {
      const next = fn(p);
      AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const reloadMeta = useCallback(async () => {
    try {
      setMeta((await api('/meta', { auth: false })).data);
    } catch {
      /* the screens show their own error when they need meta */
    }
  }, []);

  const signOutLocal = useCallback(() => {
    closeLive();
    setUser(null);
    setMe(null);
    setUnread(0);
  }, []);

  const reloadMe = useCallback(async () => {
    if (!user) return null;
    const m = await fetchMe(user.role);
    setMe(m);
    setUser(m.user);
    return m;
  }, [user]);

  const loadUnread = useCallback(async () => {
    try {
      setUnread((await api('/notifications')).meta?.unread ?? 0);
    } catch {
      /* not important */
    }
  }, []);

  // Start-up: preferences, meta, and the saved session (if any).
  useEffect(() => {
    onSignedOut(signOutLocal);
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PREFS_KEY);
        if (raw) {
          const p = JSON.parse(raw) as Prefs;
          if (p.v === 2) {
            setI18nLang(p.lang);
            setPrefs(p);
          }
        }
      } catch {}
      await loadApiUrl();
      await reloadMeta();
      if (await loadTokens()) {
        try {
          const d = await refresh();
          setUser(d.user);
          setMe(await fetchMe(d.user.role));
          loadUnread();
        } catch {
          // Offline or signed out: start at login. (A network error keeps the saved session for next time.)
        }
      }
      setReady(true);
    })();
  }, [reloadMeta, signOutLocal, loadUnread]);

  useLive({ notification: () => setUnread(n => n + 1) }, !!user);

  const value = useMemo<Ctx>(
    () => ({
      prefs,
      ready,
      user,
      me,
      meta,
      unread,
      chooseLang: l => {
        setI18nLang(l);
        savePrefs(p => ({ ...p, lang: l, langChosen: true }));
      },
      seeIntro: () => savePrefs(p => ({ ...p, introSeen: true })),
      chooseRole: r => savePrefs(p => ({ ...p, role: r })),
      login: async (phone, otp) => {
        const role = prefs.role ?? 'client';
        const d = await verifyOtp(phone, role, otp);
        const m = await fetchMe(role);
        setUser(m.user);
        setMe(m);
        loadUnread();
        return { isNew: d.isNew };
      },
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => {});
        await clearTokens();
        signOutLocal();
        savePrefs(p => ({ ...p, role: null }));
      },
      deleteAccount: async () => {
        await api('/auth/account', { method: 'DELETE' });
        await clearTokens();
        signOutLocal();
        savePrefs(p => ({ ...p, role: null }));
      },
      reloadMe,
      reloadMeta,
      setUnread,
    }),
    [prefs, ready, user, me, meta, unread, savePrefs, signOutLocal, reloadMe, reloadMeta, loadUnread],
  );

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error('useApp outside AppStoreProvider');
  return c;
}

/** The logged-in client's or advocate's profile (screens only render once it is loaded). */
export function useClientMe() {
  const { me } = useApp();
  return me?.kind === 'client' ? me : null;
}
export function useAdvocateMe() {
  const { me } = useApp();
  return me?.kind === 'advocate' ? me : null;
}
