import React, { useEffect, useState } from 'react';
import { Alert, Image, ScrollView, View } from 'react-native';
import {
  ArrowLeft,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  Briefcase,
  Camera,
  Check,
  ChevronRight,
  CircleHelp,
  Clock,
  CreditCard,
  FileCheck,
  Globe,
  IdCard,
  Image as ImageIcon,
  Landmark,
  LogOut,
  MessageCircle,
  Pencil,
  RotateCcw,
  Settings as SettingsIcon,
  ShieldCheck,
  TriangleAlert,
  User,
} from 'lucide-react-native';
import T from '../components/T';
import { AppBar, BillRow, Body, BottomBar, Button, Card, Chip, Select, Divider, EmptyState, Field, IconBtn, InkHeader, ListRow, Note, Pill, Radio, SectionHeader, Tap, Timeline, useBarStyle } from '../components/ui';
import { CASE_STATUS, Emblem, MembershipCard } from '../components/brand';
import { CategoryArt } from '../components/art';
import { LoadError, Loading, SecureImage, usePay } from '../components/data';
import { colors, categoryTone } from '../theme';
import { categoryOf, DISTRICTS, DOC_STEPS, STATES } from '../data/catalog';
import { AdvocateMe, CaseStatus, useAdvocateMe, useApp } from '../store/AppStore';
import { advocateRoute } from '../navigation/routes';
import { api, errText, photoForm } from '../api/client';
import { useApi } from '../api/hooks';
import { useLive } from '../api/live';
import { advocatePayout, inr } from '../utils/money';
import { ago, dateShort, greeting, phonePretty } from '../utils/format';
import { choosePhoto, openWhatsApp, takePhoto } from '../utils/media';
import { resetTo } from './auth';
import { LANGS, tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

/** A case as the API sends it to its advocate (server caseView). */
type Case = {
  id: string;
  category: string;
  title: string;
  issue: string;
  clientName: string;
  district: string;
  lang: string;
  docs: { id: string }[];
  assignedAt: string | null;
  status: CaseStatus;
  quote: { fee: number; scope: string; validTill: string; at: string } | null;
  declineReason: string | null;
  payout: { commission: number; gstOnCommission: number; net: number; commissionPercent: number; gstPercent: number } | null;
  paidAt: string | null;
  doneAt: string | null;
  autoConfirmAt: string | null;
  completedAt: string | null;
  rating: number | null;
  dispute: { reason: string; status: string } | null;
};

const ts = (d?: string | null) => (d ? new Date(d).getTime() : 0);
const docPath = (key: string) => '/advocate/documents/' + key + '/file';
const TOTAL_STEPS = 8;

function StepHeader({ step, title, sub, onBack }: { step: number; title: string; sub?: string; onBack?: () => void }) {
  const { meta } = useApp();
  return (
    <InkHeader style={{ paddingLeft: 8, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        {onBack ? <IconBtn icon={ArrowLeft} label="Back" color={colors.white} onPress={onBack} /> : <View style={{ width: 12 }} />}
        <T size={13} w="semibold" color={colors.onInkMuted} style={{ flex: 1 }} raw>
          {tr('Verification') + ' · ' + tr('Step {a} of {b}', { a: step, b: TOTAL_STEPS })}
        </T>
        <Tap onPress={() => openWhatsApp('Advocate verification', meta?.supportWhatsApp)} hitSlop={8} style={{ paddingHorizontal: 8 }}>
          <T w="semibold" size={13} color={colors.gold}>
            Help
          </T>
        </Tap>
      </View>
      <View style={{ flexDirection: 'row', gap: 4, paddingLeft: 12, marginTop: 6 }}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: i < step - 1 ? colors.white : i === step - 1 ? colors.gold : '#3A3833' }} />
        ))}
      </View>
      <View style={{ paddingLeft: 12, marginTop: 10 }}>
        <T w="serif" size={20} color={colors.white}>
          {title}
        </T>
        {sub ? (
          <T size={12.5} color={colors.onInkMuted} lh={18} style={{ marginTop: 4 }}>
            {sub}
          </T>
        ) : null}
      </View>
    </InkHeader>
  );
}

/** Move on to wherever the advocate's registration now stands. */
function goNext(navigation: any, me: AdvocateMe | null) {
  if (me) resetTo(navigation, advocateRoute(me));
}

/* ---------- 1. personal details ---------- */

export function AdvDetails({ navigation }: P) {
  const { reloadMe } = useApp();
  const a = useAdvocateMe();
  const [name, setName] = useState(a?.user.name ?? '');
  const [email, setEmail] = useState(a?.user.email ?? '');
  const [address, setAddress] = useState(a?.address ?? '');
  const [state, setState] = useState(a?.state || 'Madhya Pradesh');
  const [district, setDistrict] = useState(a?.district || 'Indore');
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoV, setPhotoV] = useState(0);
  const [busy, setBusy] = useState(false);
  const locked = a?.verification.status !== 'draft';
  const hasPhoto = !!a?.hasPhoto || !!photo;
  const ok = name.trim().length >= 3 && /\S+@\S+\.\S+/.test(email) && address.trim().length >= 5 && hasPhoto;

  const upload = async (u: string | null) => {
    if (!u) return;
    setPhoto(u);
    try {
      await api('/advocate/photo', { method: 'PUT', form: photoForm(u) });
      setPhotoV(v => v + 1);
      await reloadMe();
    } catch (e) {
      setPhoto(null);
      Alert.alert(tr('Photo not saved'), errText(e));
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      await api('/advocate/profile', { method: 'PATCH', body: { name: name.trim().replace(/^adv\.?\s*/i, ''), email: email.trim(), address: address.trim(), state, district } });
      const me = (await reloadMe()) as AdvocateMe | null;
      if (me && !me.practice.length) navigation.navigate('AdvPractice');
      else goNext(navigation, me);
    } catch (e) {
      Alert.alert(tr('Could not save'), errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={1} title="Your details" sub="As written on your Bar Council enrolment" />
      <Body>
        {locked ? <Note tone="neutral">Your details are with our verification team and cannot be changed now.</Note> : null}
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Tap
            disabled={locked}
            onPress={async () => upload(await takePhoto(true))}
            accessibilityLabel={tr('Take profile photo')}
            style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.white, borderWidth: 2, borderColor: hasPhoto ? colors.gold : colors.lineStrong, borderStyle: hasPhoto ? 'solid' : 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: 100, height: 100 }} /> : a?.hasPhoto ? <SecureImage path="/advocate/photo" version={photoV} style={{ width: 100, height: 100 }} /> : <Camera size={30} color={colors.muted} />}
          </Tap>
          {!locked ? (
            <View style={{ flexDirection: 'row', gap: 16 }}>
              <Tap onPress={async () => upload(await takePhoto(true))} hitSlop={8}>
                <T w="semibold" size={13} color={colors.goldText}>
                  {hasPhoto ? 'Retake selfie' : 'Take a selfie'}
                </T>
              </Tap>
              <Tap onPress={async () => upload(await choosePhoto())} hitSlop={8}>
                <T w="semibold" size={13} color={colors.goldText}>
                  Choose photo
                </T>
              </Tap>
            </View>
          ) : null}
          <T size={12} color={colors.muted}>
            Clients see this photo after you accept their request
          </T>
        </View>
        <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Rohan Malhotra" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="name@example.com" />
        <Field label="Address" value={address} onChangeText={setAddress} placeholder="Chamber or office address" />
        <Select label="State" value={state} options={STATES.includes(state) ? STATES : [state, ...STATES]} onChange={setState} placeholder="Choose your state" />
        <Select label="District" value={district} options={DISTRICTS.includes(district) ? DISTRICTS : [district, ...DISTRICTS]} onChange={setDistrict} placeholder="Choose your district" />
        <T size={12} color={colors.muted} raw>
          {tr('Mobile') + ': +91 ' + phonePretty(a?.user.phone ?? '')}
        </T>
      </Body>
      <BottomBar>
        <Button title="Next" disabled={!ok || locked} loading={busy} onPress={save} />
        {!hasPhoto ? (
          <T size={12} color={colors.muted} center>
            Add a profile photo to continue
          </T>
        ) : null}
      </BottomBar>
    </View>
  );
}

/* ---------- 2. practice ---------- */

export function AdvPractice({ navigation }: P) {
  const { meta, reloadMe } = useApp();
  const a = useAdvocateMe();
  const locked = a?.verification.status !== 'draft';
  const [practice, setPractice] = useState<string[]>(a?.practice ?? []);
  const [years, setYears] = useState(a?.experienceYears != null ? String(a.experienceYears) : '');
  const [courts, setCourts] = useState(a?.courts || (a?.district ? a.district + ' District Court' : ''));
  const [enrol, setEnrol] = useState(a?.enrolmentNumber ?? '');
  const [busy, setBusy] = useState(false);
  const ok = practice.length > 0 && /^\d{1,2}$/.test(years) && courts.trim().length > 2 && enrol.trim().length >= 5;
  const save = async () => {
    setBusy(true);
    try {
      await api('/advocate/profile', { method: 'PATCH', body: { practice, experienceYears: Number(years), courts: courts.trim(), enrolmentNumber: enrol.trim() } });
      goNext(navigation, (await reloadMe()) as AdvocateMe | null);
    } catch (e) {
      Alert.alert(tr('Could not save'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={2} title="Your practice" sub="We send you requests from these areas only" onBack={navigation.canGoBack() ? () => navigation.goBack() : () => navigation.replace('AdvDetails')} />
      <Body>
        {locked ? <Note tone="neutral">Your practice details are with our verification team. To change them, contact support.</Note> : null}
        <T w="semibold" size={13} color={colors.text2}>
          Practice areas (pick one or more)
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {(meta?.categories ?? []).map(c => {
            const on = practice.includes(c.key);
            return (
              <Tap
                key={c.key}
                disabled={locked}
                onPress={() => setPractice(on ? practice.filter(x => x !== c.key) : [...practice, c.key])}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={{ width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, backgroundColor: on ? colors.goldTint : colors.white, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line }}>
                <CategoryArt k={c.key} size={40} radius={9} />
                <T w="semibold" size={13} style={{ flex: 1 }} raw>
                  {c.short || c.name}
                </T>
                {on ? <Check size={16} color={colors.ink} /> : null}
              </Tap>
            );
          })}
        </View>
        <Field label="Years of practice" value={years} onChangeText={t => setYears(t.replace(/\D/g, '').slice(0, 2))} keyboardType="number-pad" placeholder="e.g. 8" />
        <Field label="Court(s) where you practise" value={courts} onChangeText={setCourts} placeholder="e.g. Indore District Court" />
        <Field label="Bar enrolment number" value={enrol} onChangeText={t => setEnrol(t.toUpperCase())} placeholder="e.g. MP/1287/2014" />
      </Body>
      {!locked ? (
        <BottomBar>
          <Button title="Next: documents" disabled={!ok} loading={busy} onPress={save} />
        </BottomBar>
      ) : null}
    </View>
  );
}

/* ---------- 3–7. one document per screen ---------- */

export function AdvDoc({ navigation, route }: P) {
  const { reloadMe } = useApp();
  const a = useAdvocateMe();
  useLang();
  const i: number = route.params?.i ?? 0;
  const retake: boolean = !!route.params?.retake;
  const d = DOC_STEPS[i];
  const server = a?.documents.find(x => x.key === d.key);
  const [uri, setUri] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const has = !!uri || (!retake && !!server && server.status !== 'missing');

  const next = async () => {
    setBusy(true);
    try {
      if (uri) await api('/advocate/documents/' + d.key, { method: 'PUT', form: photoForm(uri) });
      const me = (await reloadMe()) as AdvocateMe | null;
      if (retake || me?.verification.status !== 'draft') goNext(navigation, me);
      else if (i < DOC_STEPS.length - 1) navigation.push('AdvDoc', { i: i + 1 });
      else navigation.navigate('AdvReview');
    } catch (e) {
      Alert.alert(tr('Document not saved'), errText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={3 + Math.min(i, 4)} title={d.title} sub={d.hint} onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <Body>
        <View style={{ height: 280, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : has ? (
            <SecureImage path={docPath(d.key)} version={server?.version} fallback="image" resizeMode="contain" style={{ width: '100%', height: '100%' }} />
          ) : (
            <>
              <View style={{ position: 'absolute', left: 34, right: 34, top: 44, bottom: 44, borderRadius: 6, backgroundColor: '#F4EEDD', opacity: 0.92, alignItems: 'center', paddingTop: 22, gap: 8 }}>
                <IdCard size={30} color={colors.goldText} />
                <View style={{ width: '70%', height: 8, borderRadius: 4, backgroundColor: '#D8CDB0' }} />
                <View style={{ width: '50%', height: 6, borderRadius: 3, backgroundColor: '#E2D9C1' }} />
                <View style={{ width: '84%', height: 6, borderRadius: 3, backgroundColor: '#E2D9C1', marginTop: 10 }} />
                <View style={{ width: '60%', height: 6, borderRadius: 3, backgroundColor: '#E2D9C1' }} />
              </View>
              {[
                { left: 20, top: 30, borderLeftWidth: 3, borderTopWidth: 3, borderTopLeftRadius: 8 },
                { right: 20, top: 30, borderRightWidth: 3, borderTopWidth: 3, borderTopRightRadius: 8 },
                { left: 20, bottom: 30, borderLeftWidth: 3, borderBottomWidth: 3, borderBottomLeftRadius: 8 },
                { right: 20, bottom: 30, borderRightWidth: 3, borderBottomWidth: 3, borderBottomRightRadius: 8 },
              ].map((c, k) => (
                <View key={k} style={[{ position: 'absolute', width: 28, height: 28, borderColor: colors.gold }, c]} />
              ))}
              <T w="semibold" size={12} color={colors.gold} style={{ position: 'absolute', bottom: 8 }}>
                Fit the whole document inside the frame
              </T>
            </>
          )}
        </View>
        {server?.status === 'reupload' && server.note ? (
          <Note tone="orange" icon={TriangleAlert}>
            {tr('Our team asked for a retake') + ': "' + server.note + '"'}
          </Note>
        ) : null}
        {['All four corners visible', 'Name and number readable', 'No glare or shadow on the text'].map(t => (
          <View key={t} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Check size={18} color={colors.green} />
            <T w="medium" size={13} color={colors.text2}>
              {t}
            </T>
          </View>
        ))}
      </Body>
      <BottomBar>
        {has ? (
          <>
            <Button title={retake ? 'Send this photo' : i < DOC_STEPS.length - 1 ? 'Use this photo' : 'Review and submit'} loading={busy} onPress={next} />
            <Button title="Retake" variant="line" icon={RotateCcw} onPress={async () => { const u = await takePhoto(); if (u) setUri(u); }} />
          </>
        ) : (
          <>
            <Button title="Take photo" icon={Camera} onPress={async () => { const u = await takePhoto(); if (u) setUri(u); }} />
            <Button title="Choose from gallery" variant="line" icon={ImageIcon} onPress={async () => { const u = await choosePhoto(); if (u) setUri(u); }} />
          </>
        )}
      </BottomBar>
    </View>
  );
}

/* ---------- 8. review ---------- */

export function AdvReview({ navigation }: P) {
  const { meta, reloadMe } = useApp();
  const a = useAdvocateMe();
  const [busy, setBusy] = useState(false);
  if (!a) return null;
  const missing = DOC_STEPS.filter(d => a.documents.find(x => x.key === d.key)?.status === 'missing');
  const submit = async () => {
    setBusy(true);
    try {
      await api('/advocate/verification/submit', { method: 'POST' });
      await reloadMe();
      resetTo(navigation, { name: 'AdvStatus' });
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Could not submit'), errText(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={8} title="Review and submit" sub="Check everything once. Our team verifies it within 12 to 24 hours." onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <Body>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <SecureImage path={a.hasPhoto ? '/advocate/photo' : null} style={{ width: 52, height: 52, borderRadius: 26, borderWidth: 2, borderColor: colors.gold }} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={15} raw>
              {'Adv. ' + a.user.name}
            </T>
            <T size={12} color={colors.muted} raw>
              {a.practice.map(p => categoryOf(p, meta).short).join(', ') + ' · ' + (a.experienceYears ?? '') + ' ' + tr('yrs')}
            </T>
            <T size={12} color={colors.muted} raw>
              {a.enrolmentNumber + ' · ' + a.district}
            </T>
          </View>
          <IconBtn icon={Pencil} label="Edit details" onPress={() => navigation.navigate('AdvDetails')} />
        </Card>
        <Card style={{ padding: 4 }}>
          {DOC_STEPS.map((d, i) => {
            const doc = a.documents.find(x => x.key === d.key);
            const added = doc && doc.status !== 'missing';
            return (
              <View key={d.key}>
                {i ? <Divider /> : null}
                <Tap onPress={() => navigation.navigate('AdvDoc', { i })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                  {added ? (
                    <SecureImage path={docPath(d.key)} version={doc?.version} fallback="image" style={{ width: 48, height: 48, borderRadius: 8 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={20} color={colors.muted} />
                    </View>
                  )}
                  <T w="semibold" size={13.5} style={{ flex: 1 }}>
                    {d.title}
                  </T>
                  {added ? <Pill label="Added" tone="green" dot={false} /> : <Pill label="Missing" tone="orange" dot={false} />}
                </Tap>
              </View>
            );
          })}
        </Card>
        <Note icon={ShieldCheck}>Only the Vakeel Bhai verification team can see your documents. Aadhaar is never shown to clients.</Note>
      </Body>
      <BottomBar>
        <Button title="Submit for verification" disabled={missing.length > 0 || a.missing.length > 0} loading={busy} onPress={submit} />
        {missing.length ? (
          <T size={12} color={colors.muted} center raw>
            {tr('{n} documents still missing', { n: missing.length })}
          </T>
        ) : null}
      </BottomBar>
    </View>
  );
}

/* ---------- verification status ---------- */

export function AdvStatus({ navigation }: P) {
  const { meta, reloadMe } = useApp();
  const a = useAdvocateMe();
  useLang();
  useLive({ notification: () => reloadMe().catch(() => {}) });
  useEffect(() => {
    reloadMe().catch(() => {});
    // Once, on open; notifications refresh it after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!a) return null;
  const v = a.verification.status;
  const re = v === 'reupload';
  const ok = v === 'approved';
  const rejected = v === 'rejected';
  const retake = DOC_STEPS.map((d, i) => ({ d, i, doc: a.documents.find(x => x.key === d.key) })).filter(x => x.doc?.status === 'reupload');
  const docTone = (st?: string) => (st === 'approved' ? 'green' : st === 'reupload' || st === 'rejected' ? 'orange' : 'neutral');
  const docLabel = (st?: string) => (st === 'approved' ? 'Approved' : st === 'reupload' ? 'Retake' : st === 'rejected' ? 'Rejected' : 'In review');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ paddingBottom: 16, gap: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: ok ? colors.green : colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          {ok ? <ShieldCheck size={22} color={colors.green} /> : <Clock size={22} color={colors.gold} />}
        </View>
        <T w="serif" size={21} color={colors.white}>
          {ok ? 'You are verified' : re ? 'Almost there' : rejected ? 'Verification not approved' : 'Verification in progress'}
        </T>
        <T size={14} color={colors.onInkMuted} lh={21}>
          {ok
            ? 'Your documents are approved. Choose a membership to start receiving client requests.'
            : re
              ? 'Our team needs a document again. Retake it and we will finish the check.'
              : rejected
                ? a.verification.reason ?? 'Please contact support.'
                : 'Our team is checking your Bar Council documents. This usually takes 12 to 24 hours.'}
        </T>
      </InkHeader>
      <Body gap={14}>
        {re && retake.length ? (
          <View style={{ backgroundColor: '#FDF3EA', borderWidth: 1, borderColor: '#F3D9C2', borderRadius: 14, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TriangleAlert size={20} color={colors.orange} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={14} color={colors.orangeText} raw>
                  {tr('{n} document needs a retake', { n: retake.length })}
                </T>
                {retake.map(x => (
                  <T key={x.d.key} size={13} color={colors.orangeText} lh={19} raw>
                    {tr(x.d.title) + ': "' + (x.doc?.note ?? '') + '"'}
                  </T>
                ))}
              </View>
            </View>
            {retake.map(x => (
              <Button key={x.d.key} title={tr('Retake') + ' ' + tr(x.d.title)} variant="ink" small onPress={() => navigation.navigate('AdvDoc', { i: x.i, retake: true })} />
            ))}
          </View>
        ) : null}

        <Card>
          <Timeline
            steps={[
              { title: 'Profile submitted', sub: a.verification.submittedAt ? dateShort(ts(a.verification.submittedAt)) : undefined, state: 'done' },
              { title: 'Documents uploaded', sub: tr('{n} documents', { n: DOC_STEPS.length }), state: 'done' },
              { title: 'Admin review', sub: ok ? tr('Approved') : re ? tr('Waiting for your retake') : rejected ? tr('Not approved') : tr('Usually within 24 hours'), state: ok ? 'done' : 'now' },
              { title: 'Choose a membership', sub: tr('You start receiving client requests after this'), state: ok ? 'now' : 'todo' },
            ]}
          />
        </Card>

        <Card style={{ paddingVertical: 4 }}>
          <T w="bold" size={14} style={{ paddingVertical: 10 }}>
            Your documents
          </T>
          {DOC_STEPS.map(d => {
            const doc = a.documents.find(x => x.key === d.key);
            return (
              <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
                <SecureImage path={doc && doc.status !== 'missing' ? docPath(d.key) : null} version={doc?.version} fallback="image" style={{ width: 40, height: 40, borderRadius: 8 }} />
                <T w="semibold" size={13} style={{ flex: 1 }}>
                  {d.title}
                </T>
                <Pill label={docLabel(doc?.status)} tone={docTone(doc?.status) as any} dot={false} />
              </View>
            );
          })}
        </Card>
      </Body>
      <BottomBar>
        {ok ? (
          <Button title="Choose a membership" onPress={() => navigation.navigate('Plans')} />
        ) : (
          <Button title="Questions? Contact support" variant="line" icon={MessageCircle} onPress={() => navigation.navigate('NewTicket', { topic: 'account' })} />
        )}
      </BottomBar>
    </View>
  );
}

/* ---------- membership ---------- */

export function Plans({ navigation, route }: P) {
  const { meta, reloadMe } = useApp();
  const a = useAdvocateMe();
  useLang();
  const renewing = !!route.params?.renew;
  const plans = meta?.plans ?? [];
  const [plan, setPlan] = useState(plans.find(p => p.best)?.id ?? plans[0]?.id ?? '');
  const [paying, setPaying] = useState(false);
  const [code, setCode] = useState('');
  const { pay, sheet } = usePay();
  const sel = plans.find(p => p.id === plan);
  const gstRate = meta?.rates.gst ?? 0.18;
  if (!a) return null;
  const buy = async () => {
    if (!sel) return;
    setPaying(true);
    try {
      const co = (await api('/advocate/membership/checkout', { method: 'POST', body: { planId: sel.id, ...(code ? { code } : {}) } })).data;
      await pay(co);
      const me = (await reloadMe()) as AdvocateMe | null;
      if (renewing) navigation.goBack();
      else goNext(navigation, me);
    } catch (e: any) {
      if (e?.code !== 'CANCELLED') Alert.alert(tr('Payment not completed'), errText(e));
    } finally {
      setPaying(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={renewing ? 'Renew membership' : 'Membership'} onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <Body>
        {!renewing ? <Note icon={ShieldCheck}>Documents approved. One step left.</Note> : null}
        <MembershipCard adv={a} planName={sel?.name} preview={!a.membership} />
        <T w="bold" size={17} style={{ marginTop: 4 }}>
          Choose a plan
        </T>
        {plans.length === 0 ? <EmptyState title="No plans yet" sub="Our team is setting up the membership plans. Please check again soon." /> : null}
        {plans.map(p => {
          const on = p.id === plan;
          return (
            <Tap
              key={p.id}
              onPress={() => setPlan(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{ borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: on ? colors.goldWash : colors.white, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line }}>
              <Radio on={on} />
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T w="bold" size={15} raw>
                    {p.name}
                  </T>
                  {p.best ? (
                    <View style={{ backgroundColor: colors.goldTint, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <T w="bold" size={10.5} color={colors.goldText}>
                        Best value
                      </T>
                    </View>
                  ) : null}
                </View>
                <T size={12} color={colors.muted} raw>
                  {p.note || tr('{n} months', { n: p.months })}
                </T>
              </View>
              <T w="extrabold" size={15} raw>
                {p.price != null ? inr(p.price) : tr('Price soon')}
              </T>
            </Tap>
          );
        })}
        <Field label="Coupon code (optional)" value={code} onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} maxLength={20} autoCapitalize="characters" hint="The discount and GST are shown in the payment window before you pay" />
        {sel?.benefits?.length ? (
          <Card style={{ gap: 10 }}>
            <T w="bold" size={14}>
              This plan includes
            </T>
            {sel.benefits.map(t => (
              <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
                <Check size={18} color={colors.green} />
                <T size={13} w="medium" color={colors.text2} lh={19} style={{ flex: 1 }} raw>
                  {t}
                </T>
              </View>
            ))}
          </Card>
        ) : null}
      </Body>
      <BottomBar row>
        <View>
          <T w="extrabold" size={18} raw>
            {sel?.price != null ? inr(sel.price) : '—'}
          </T>
          <T size={11.5} w="medium" color={colors.muted} raw>
            {'+ ' + Math.round(gstRate * 100) + '% GST' + (sel ? ' · ' + sel.name : '')}
          </T>
        </View>
        <Button title={paying ? 'Processing…' : renewing ? 'Renew' : 'Pay and activate'} loading={paying} disabled={!sel || sel.price == null} style={{ flex: 1 }} onPress={buy} />
      </BottomBar>
      {sheet}
    </View>
  );
}

export function MembershipCardScreen({ navigation }: P) {
  const a = useAdvocateMe();
  if (!a) return null;
  const m = a.membership;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Membership card" onBack={() => navigation.goBack()} />
      <Body>
        <MembershipCard adv={a} />
        <Card style={{ gap: 10 }}>
          <BillRow label="Plan" value={m?.planName ?? '—'} raw />
          <BillRow label="Member ID" value={m?.memberId ?? '—'} raw />
          <BillRow label="Started" value={m ? dateShort(ts(m.startAt)) : '—'} raw />
          <BillRow label="Valid till" value={m ? dateShort(ts(m.endAt)) : '—'} raw />
          <BillRow label="Status" value={m?.active ? tr('Active') : tr('Expired')} color={m?.active ? colors.green : colors.red} raw />
        </Card>
      </Body>
      <BottomBar>
        <Button title="Renew or change plan" variant="line" onPress={() => navigation.navigate('Plans', { renew: true })} />
      </BottomBar>
    </View>
  );
}

/* ---------- dashboard ---------- */

function ClientIcon({ size = 38 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <User size={size * 0.47} color="#4A4740" />
    </View>
  );
}

function CaseRow({ c, onPress }: { c: Case; onPress: () => void }) {
  const { meta } = useApp();
  const st = CASE_STATUS[c.status];
  return (
    <Tap onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
      <ClientIcon />
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14} raw numberOfLines={1}>
          {c.clientName + ' · ' + categoryOf(c.category, meta).short}
        </T>
        <T size={12} w="medium" color={colors.muted} raw numberOfLines={1}>
          {c.title + ' · ' + c.id}
        </T>
      </View>
      <Pill label={st.label} tone={st.tone} dot={false} />
    </Tap>
  );
}

type WalletView = { balance: number; hold: number; lifetime: number; month: { earned: number; cases: number }; account: { holder: string; accountLast4: string; ifsc: string; upi: string } | null; tx: { id: string; type: string; title: string; sub: string; amount: number; hold: number; at: string; status: string | null; lines: { k: string; v: number }[] }[] };

export function AdvDashboard({ navigation }: P) {
  const { meta, unread } = useApp();
  const a = useAdvocateMe();
  useLang();
  const cases = useApi<Case[]>('/advocate/cases?tab=all');
  const wallet = useApi<WalletView>('/advocate/wallet');
  useLive({ 'case:new': cases.reload, 'request:update': () => { cases.reload(); wallet.reload(); }, reconnect: cases.reload });
  const [accepting, setAccepting] = useState('');
  if (!a) return null;
  const all = cases.data ?? [];
  const fresh = all.filter(c => c.status === 'new');
  const active = all.filter(c => ['accepted', 'quoted', 'paid', 'done', 'disputed'].includes(c.status));
  const rated = all.filter(c => c.rating);
  const rating = rated.length ? rated.reduce((x, c) => x + (c.rating ?? 0), 0) / rated.length : 0;
  const m = a.membership;
  const accept = async (id: string) => {
    setAccepting(id);
    try {
      await api('/advocate/cases/' + id + '/accept', { method: 'POST' });
      navigation.navigate('CaseDetail', { id });
      cases.reload();
    } catch (e) {
      Alert.alert(tr('Could not accept'), errText(e));
    } finally {
      setAccepting('');
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <SecureImage path={a.hasPhoto ? '/advocate/photo' : null} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: colors.gold }} />
          <View style={{ flex: 1 }}>
            <T size={12} w="medium" color={colors.onInkMuted}>
              {greeting()}
            </T>
            <T w="bold" size={17} color={colors.white} raw numberOfLines={1}>
              {'Adv. ' + a.user.name}
            </T>
          </View>
          <IconBtn icon={Bell} label="Notifications" color={colors.white} bordered="dark" badge={unread > 0} onPress={() => navigation.navigate('Notifications')} />
        </View>
        <Tap onPress={() => navigation.navigate('MembershipCard')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.inkLine, borderRadius: 12, padding: 10 }}>
          <Emblem size={26} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={13} color={colors.gold} raw>
              {(m?.planName ?? '') + ' ' + tr('member') + ' · ' + (m?.memberId ?? '')}
            </T>
            <T size={12} w="medium" color={colors.onInkMuted} raw>
              {tr('Active till') + ' ' + (m ? dateShort(ts(m.endAt)) : '—') + ' · ' + tr('View card')}
            </T>
          </View>
          <ChevronRight size={18} color={colors.onInkMuted} />
        </Tap>
      </InkHeader>
      {cases.error ? (
        <LoadError error={cases.error} onRetry={cases.reload} />
      ) : (
        <Body gap={18}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            <Stat label="Wallet balance" value={wallet.data ? inr(wallet.data.balance) : '…'} onPress={() => navigation.navigate('AdvWallet')} />
            <Stat label="Earned this month" value={wallet.data ? inr(wallet.data.month.earned) : '…'} />
            <Stat label="Active cases" value={cases.data ? String(active.length) : '…'} onPress={() => navigation.navigate('Cases')} />
            <Stat label="Rating" value={rating ? rating.toFixed(1) : '—'} />
          </View>

          <View style={{ gap: 10 }}>
            <SectionHeader title={tr('New requests') + ' · ' + fresh.length} action="All cases" onAction={() => navigation.navigate('Cases')} />
            {!cases.data ? (
              <Loading />
            ) : fresh.length === 0 ? (
              <Card>
                <T size={13} color={colors.muted}>
                  No new requests right now. Our team assigns requests that match your practice areas and district.
                </T>
              </Card>
            ) : (
              fresh.map(c => {
                const tone = categoryTone[c.category] ?? categoryTone.other;
                return (
                  <Card key={c.id} style={{ borderColor: colors.ink, borderWidth: 1.5, gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <View style={{ backgroundColor: tone.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                        <T w="semibold" size={11.5} color={tone.fg} raw>
                          {categoryOf(c.category, meta).short}
                        </T>
                      </View>
                      <T size={12} w="medium" color={colors.muted} raw>
                        {c.id + ' · ' + tr('assigned by admin') + ' ' + ago(ts(c.assignedAt))}
                      </T>
                    </View>
                    <T w="bold" size={15} raw>
                      {c.title}
                    </T>
                    <T size={13} color={colors.text2} lh={19} raw numberOfLines={3}>
                      {'"' + c.issue + '" · ' + c.district + ' · ' + c.lang}
                    </T>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <Button title="Accept" small style={{ flex: 1 }} loading={accepting === c.id} onPress={() => accept(c.id)} />
                      <Button title="View" small variant="line" onPress={() => navigation.navigate('CaseDetail', { id: c.id })} />
                    </View>
                  </Card>
                );
              })
            )}
          </View>

          <Card style={{ paddingVertical: 4 }}>
            <View style={{ paddingTop: 12, paddingBottom: 8 }}>
              <SectionHeader title="Active cases" action={active.length ? tr('See all') : undefined} onAction={() => navigation.navigate('Cases')} />
            </View>
            {active.length === 0 ? (
              <T size={13} color={colors.muted} style={{ paddingBottom: 12 }}>
                Cases you accept appear here.
              </T>
            ) : (
              active.slice(0, 4).map(c => <CaseRow key={c.id} c={c} onPress={() => navigation.navigate('CaseDetail', { id: c.id })} />)
            )}
          </Card>

          {wallet.data ? (
            <Card style={{ gap: 9 }}>
              <T w="bold" size={15}>
                This month's earnings
              </T>
              <BillRow label={tr('Credited from {n} completed cases', { n: wallet.data.month.cases })} value={inr(wallet.data.month.earned)} strong raw />
              <BillRow label="On hold (waiting for clients to confirm)" value={inr(wallet.data.hold)} />
              <T size={12} color={colors.muted}>
                Each credit shows the commission and GST breakup in your wallet.
              </T>
            </Card>
          ) : null}
        </Body>
      )}
    </View>
  );
}

function Stat({ label, value, onPress }: { label: string; value: string; onPress?: () => void }) {
  return (
    <Card onPress={onPress} style={{ width: '48%', flexGrow: 1, gap: 4, paddingVertical: 12 }}>
      <T size={12} w="medium" color={colors.muted}>
        {label}
      </T>
      <T w="extrabold" size={20} raw>
        {value}
      </T>
    </Card>
  );
}

/* ---------- cases ---------- */

export function AdvCases({ navigation }: P) {
  useLang();
  const [tab, setTab] = useState<'new' | 'active' | 'completed'>('active');
  const list = useApi<Case[]>('/advocate/cases?tab=' + tab);
  useLive({ 'case:new': list.reload, 'request:update': list.reload, reconnect: list.reload });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Cases" />
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {(['new', 'active', 'completed'] as const).map(k => (
          <Tap key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
            <T w="semibold" size={14} color={tab === k ? colors.ink : colors.muted}>
              {k === 'new' ? 'New' : k === 'active' ? 'Active' : 'Completed'}
            </T>
          </Tap>
        ))}
      </View>
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <Body gap={10}>
          {list.data.length === 0 ? (
            <EmptyState icon={Briefcase} title="Nothing here yet" sub="Requests assigned by our team appear under New." />
          ) : (
            list.data.map(c => (
              <Card key={c.id} style={{ paddingVertical: 2 }}>
                <CaseRow c={c} onPress={() => navigation.navigate('CaseDetail', { id: c.id })} />
              </Card>
            ))
          )}
        </Body>
      )}
    </View>
  );
}

const DECLINE = ['Not my practice area', 'Too many active cases', 'Conflict of interest', 'Not available this week'];

export function CaseDetail({ navigation, route }: P) {
  const { meta } = useApp();
  useLang();
  const id = route.params?.id;
  const { data: c, error, reload } = useApi<Case>('/advocate/cases/' + id);
  useLive({ 'request:update': p => p.number === id && reload(), reconnect: reload });
  const [declining, setDeclining] = useState(false);
  const [busy, setBusy] = useState(false);
  const act = async (path: string, body?: any) => {
    setBusy(true);
    try {
      await api('/advocate/cases/' + id + path, { method: 'POST', body: body ?? {} });
      reload();
    } catch (e) {
      Alert.alert(tr('Could not update'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  if (error)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppBar title={id} onBack={() => navigation.goBack()} />
        <LoadError error={error} onRetry={reload} />
      </View>
    );
  if (!c)
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <AppBar title={id} onBack={() => navigation.goBack()} />
        <Loading />
      </View>
    );
  const st = CASE_STATUS[c.status];
  const cat = categoryOf(c.category, meta);
  const rates = meta?.rates;
  const est = c.quote ? advocatePayout(c.quote.fee, rates) : null;
  const order = ['new', 'accepted', 'quoted', 'paid', 'done', 'completed'];
  const at = c.status === 'disputed' ? 4 : order.indexOf(c.status);
  const step = (i: number) => (c.status === 'completed' || i <= at ? 'done' : i === at + 1 ? 'now' : 'todo') as 'done' | 'now' | 'todo';
  const chat = () => navigation.navigate('Chat', { id: c.id, side: 'advocate' });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={cat.name} sub={c.id} onBack={() => navigation.goBack()} right={<Pill label={st.label} tone={st.tone} />} />
      <Body>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ClientIcon size={44} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={15} raw>
              {c.clientName}
            </T>
            <T size={12} w="medium" color={colors.muted} raw>
              {c.district + ' · ' + tr('prefers') + ' ' + c.lang}
            </T>
          </View>
        </Card>
        <Card style={{ gap: 8 }}>
          <T w="bold" size={15} raw>
            {c.title}
          </T>
          <T size={13.5} color={colors.text2} lh={20} raw>
            {c.issue}
          </T>
          <T size={12} color={colors.muted} raw>
            {tr('Assigned') + ' ' + ago(ts(c.assignedAt))}
          </T>
          {c.docs.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
              {c.docs.map(d => (
                <SecureImage key={d.id} path={'/advocate/cases/' + c.id + '/attachments/' + d.id} fallback="image" style={{ width: 64, height: 64, borderRadius: 10 }} />
              ))}
            </ScrollView>
          ) : null}
        </Card>

        {c.status !== 'declined' && c.status !== 'refunded' ? (
          <Card>
            <Timeline
              steps={[
                { title: 'Assigned to you', state: step(0) },
                { title: 'Accepted', state: step(1) },
                { title: 'Quote sent', sub: c.quote ? inr(c.quote.fee) : undefined, state: step(2) },
                { title: 'Client paid', sub: c.status === 'quoted' ? tr('Waiting for the client') : undefined, state: step(3) },
                { title: c.status === 'disputed' ? 'Disputed' : 'Work done', sub: c.status === 'done' ? tr('Waiting for the client to confirm') : c.status === 'disputed' ? tr('Our team is reviewing') : undefined, state: step(4) },
                { title: 'Paid to wallet', state: step(5) },
              ]}
            />
          </Card>
        ) : c.status === 'declined' ? (
          <Note tone="neutral">{tr('You declined this request') + (c.declineReason ? ': ' + c.declineReason : '') + '. ' + tr('It went back to the admin queue.')}</Note>
        ) : (
          <Note tone="neutral">Our team refunded the client for this case.</Note>
        )}

        {c.payout || est ? (
          <Card style={{ gap: 9 }}>
            <T w="bold" size={14}>
              Your payout
            </T>
            {c.payout ? (
              <>
                <BillRow label={tr('Platform commission') + ' (' + c.payout.commissionPercent + '%)'} value={'−' + inr(c.payout.commission)} raw />
                <BillRow label={tr('GST on commission') + ' (' + c.payout.gstPercent + '%)'} value={'−' + inr(c.payout.gstOnCommission)} raw />
                <Divider />
                <BillRow label={c.status === 'completed' ? 'Credited to wallet' : 'You will receive'} value={inr(c.payout.net)} strong />
              </>
            ) : est ? (
              <>
                <BillRow label="Fee quoted" value={inr(est.base)} />
                <BillRow label="Platform commission" value={'−' + inr(est.commission)} />
                <BillRow label="GST on commission" value={'−' + inr(est.gstOnCommission)} />
                <Divider />
                <BillRow label="You will receive (estimate)" value={inr(est.net)} strong />
              </>
            ) : null}
          </Card>
        ) : null}

        {declining ? (
          <Card style={{ gap: 10 }}>
            <T w="bold" size={14}>
              Why are you declining?
            </T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {DECLINE.map(r => (
                <Chip
                  key={r}
                  label={r}
                  onPress={() => {
                    setDeclining(false);
                    act('/decline', { reason: r });
                  }}
                />
              ))}
            </View>
          </Card>
        ) : null}
      </Body>
      <BottomBar>
        {c.status === 'new' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Accept request" style={{ flex: 1 }} loading={busy} onPress={() => act('/accept')} />
            <Button title="Decline" variant="line" onPress={() => setDeclining(!declining)} />
          </View>
        ) : c.status === 'accepted' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Send quote" style={{ flex: 1 }} onPress={() => navigation.navigate('SendQuote', { id: c.id })} />
            <Button title="Chat" variant="line" icon={MessageCircle} onPress={chat} />
          </View>
        ) : c.status === 'paid' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Mark work as done"
              style={{ flex: 1 }}
              loading={busy}
              onPress={() =>
                Alert.alert(tr('Mark as done?'), tr('The client will be asked to confirm. Payment is released after they confirm.'), [
                  { text: tr('Cancel'), style: 'cancel' },
                  { text: tr('Mark as done'), onPress: () => act('/done') },
                ])
              }
            />
            <Button title="Chat" variant="line" icon={MessageCircle} onPress={chat} />
          </View>
        ) : c.status !== 'declined' ? (
          <Button title="Open chat" variant="ink" icon={MessageCircle} onPress={chat} />
        ) : (
          <Button title="Back to cases" variant="line" onPress={() => navigation.goBack()} />
        )}
      </BottomBar>
    </View>
  );
}

export function SendQuote({ navigation, route }: P) {
  const { meta } = useApp();
  const id = route.params?.id;
  const { data: c } = useApi<Case>('/advocate/cases/' + id);
  const [fee, setFee] = useState('');
  const [scope, setScope] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (c?.quote) {
      setFee(String(c.quote.fee));
      setScope(c.quote.scope);
    }
  }, [c?.quote]);
  const n = Number(fee) || 0;
  const pay = advocatePayout(n, meta?.rates);
  const send = async () => {
    setBusy(true);
    try {
      await api('/advocate/cases/' + id + '/quote', { method: 'POST', body: { fee: n, scope: scope.trim() } });
      navigation.replace('Chat', { id, side: 'advocate' });
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Quote not sent'), errText(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Send a fee quote" sub={id + (c ? ' · ' + c.clientName : '')} onBack={() => navigation.goBack()} />
      <Body>
        <Field label="Your fee (₹)" value={fee} onChangeText={t => setFee(t.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" prefix="₹" big placeholder="e.g. 5000" />
        <Field label="What this fee covers" value={scope} onChangeText={setScope} multiline maxLength={600} placeholder="e.g. Drafting and filing the petition, 2 court appearances" />
        <Card style={{ gap: 9 }}>
          <T w="bold" size={14}>
            What you will receive
          </T>
          <BillRow label="Client pays (before GST)" value={inr(pay.base)} />
          <BillRow label={tr('Platform commission') + ' (' + Math.round((meta?.rates.commission ?? 0.2) * 100) + '%)'} value={'−' + inr(pay.commission)} raw />
          <BillRow label={tr('GST on commission') + ' (' + Math.round((meta?.rates.gst ?? 0.18) * 100) + '%)'} value={'−' + inr(pay.gstOnCommission)} raw />
          <Divider />
          <BillRow label="You receive" value={inr(pay.net)} strong />
        </Card>
        <Note tone="neutral">The quote is valid for {String(meta?.quoteValidityDays ?? 7)} days. Some practice areas have their own commission rate; the exact amount is fixed when the client pays.</Note>
      </Body>
      <BottomBar>
        <Button title="Send quote in chat" disabled={n < 100 || scope.trim().length < 10} loading={busy} onPress={send} />
      </BottomBar>
    </View>
  );
}

/* ---------- wallet ---------- */

export function AdvWallet({ navigation }: P) {
  useLang();
  const w = useApi<WalletView>('/advocate/wallet');
  const [f, setF] = useState<'all' | 'earn' | 'hold' | 'withdraw'>('all');
  const [open, setOpen] = useState<string | null>(null);
  useLive({ 'request:update': w.reload });
  const acct = w.data?.account;
  const dest = acct ? acct.upi || '••' + acct.accountLast4 : '';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Wallet" right={<Tap onPress={() => navigation.navigate('Bank')} hitSlop={8} style={{ paddingHorizontal: 8 }}><T w="semibold" size={13} color={colors.goldText}>Bank & UPI</T></Tap>} />
      {w.error ? (
        <LoadError error={w.error} onRetry={w.reload} />
      ) : !w.data ? (
        <Loading />
      ) : (
        <Body>
          <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 18, gap: 14 }}>
            <View>
              <T size={12} w="medium" color={colors.onInkMuted}>
                Available to withdraw
              </T>
              <T w="extrabold" size={32} color={colors.white} raw>
                {inr(w.data.balance)}
              </T>
            </View>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1, backgroundColor: colors.ink2, borderRadius: 10, padding: 10 }}>
                <T size={11} w="medium" color={colors.onInkMuted}>
                  On hold
                </T>
                <T w="bold" size={14} color={colors.white} raw>
                  {inr(w.data.hold)}
                </T>
                <T size={10.5} w="medium" color="#8A857A">
                  until client confirms
                </T>
              </View>
              <View style={{ flex: 1, backgroundColor: colors.ink2, borderRadius: 10, padding: 10 }}>
                <T size={11} w="medium" color={colors.onInkMuted}>
                  Lifetime earned
                </T>
                <T w="bold" size={14} color={colors.white} raw>
                  {inr(w.data.lifetime)}
                </T>
                <T size={10.5} w="medium" color="#8A857A">
                  after commission
                </T>
              </View>
            </View>
            <Button title={acct ? tr('Withdraw to') + ' ' + dest : 'Add bank to withdraw'} disabled={!!acct && w.data.balance <= 0} onPress={() => navigation.navigate(acct ? 'Withdraw' : 'Bank')} />
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                ['all', 'All'],
                ['earn', 'Earnings'],
                ['hold', 'On hold'],
                ['withdraw', 'Withdrawals'],
              ] as const
            ).map(([k, l]) => (
              <Chip key={k} label={l} active={f === k} onPress={() => setF(k)} />
            ))}
          </View>
          {(() => {
            const rows = w.data.tx.filter(t => f === 'all' || t.type === f || (f === 'withdraw' && t.type === 'withdraw_reversal') || (f === 'hold' && t.type === 'hold_release'));
            if (!rows.length) return <EmptyState title="Nothing here yet" />;
            return rows.map(t => {
              const inc = t.amount > 0;
              const lines = t.lines ?? [];
              return (
                <Card key={t.id} onPress={lines.length ? () => setOpen(open === t.id ? null : t.id) : undefined} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: inc ? colors.greenSoft : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      {inc ? <ArrowDownLeft size={19} color={colors.green} /> : t.type === 'hold' || t.type === 'hold_release' ? <Clock size={19} color={colors.text2} /> : t.type === 'fee' ? <CreditCard size={19} color={colors.text2} /> : <ArrowUpRight size={19} color={colors.text2} />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <T w="bold" size={14} raw>
                        {t.title}
                      </T>
                      <T size={12} color={colors.muted} raw>
                        {(t.sub ? t.sub + ' · ' : '') + dateShort(ts(t.at))}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T w="extrabold" size={15} color={inc ? colors.green : colors.text} raw>
                        {t.amount ? (inc ? '+' : '') + inr(t.amount) : (t.hold > 0 ? '+' : '') + inr(t.hold)}
                      </T>
                      {t.status ? (
                        <T size={11} w="semibold" color={colors.muted} raw>
                          {t.status}
                        </T>
                      ) : null}
                    </View>
                  </View>
                  {lines.length && open === t.id ? (
                    <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, gap: 6 }}>
                      {lines.map(l => (
                        <BillRow key={l.k} label={l.k} value={(l.v < 0 ? '−' : '') + inr(Math.abs(l.v))} raw />
                      ))}
                    </View>
                  ) : null}
                </Card>
              );
            });
          })()}
        </Body>
      )}
    </View>
  );
}

export function Withdraw({ navigation }: P) {
  const w = useApi<WalletView>('/advocate/wallet');
  const [amt, setAmt] = useState('');
  const [busy, setBusy] = useState(false);
  const bal = w.data?.balance ?? 0;
  useEffect(() => {
    if (w.data) setAmt(String(Math.floor(w.data.balance)));
  }, [w.data]);
  const n = Number(amt) || 0;
  const ok = n >= 1 && n <= bal;
  const acct = w.data?.account;
  const go = async () => {
    setBusy(true);
    try {
      await api('/advocate/withdrawals', { method: 'POST', body: { amount: n } });
      Alert.alert(tr('Withdrawal requested'), tr('{x} will reach your account after our team approves it.', { x: inr(n) }));
      navigation.goBack();
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Could not withdraw'), errText(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Withdraw" onBack={() => navigation.goBack()} />
      {!w.data ? (
        w.error ? <LoadError error={w.error} onRetry={w.reload} /> : <Loading />
      ) : (
        <Body>
          <Field label="Amount (₹)" value={amt} onChangeText={t => setAmt(t.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" prefix="₹" big hint={tr('Available') + ': ' + inr(bal)} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {[1000, 5000, 10000].filter(v => v <= bal).map(v => (
              <Chip key={v} label={inr(v)} raw onPress={() => setAmt(String(v))} />
            ))}
            <Chip label="All" onPress={() => setAmt(String(Math.floor(bal)))} />
          </View>
          {acct ? (
            <Card style={{ padding: 0 }}>
              <ListRow icon={Landmark} title={acct.upi ? acct.upi : tr('Bank account') + ' ••' + acct.accountLast4} sub={acct.holder} onPress={() => navigation.navigate('Bank')} />
            </Card>
          ) : null}
          <Note tone="neutral">Our team approves withdrawals and transfers the money, usually within 2 working days.</Note>
        </Body>
      )}
      <BottomBar>
        <Button title={tr('Withdraw') + ' ' + inr(n)} disabled={!ok || !acct} loading={busy} onPress={go} />
      </BottomBar>
    </View>
  );
}

export function Bank({ navigation }: P) {
  const a = useAdvocateMe();
  const cur = useApi<{ holder: string; accountLast4: string; ifsc: string; upi: string } | null>('/advocate/payout-account');
  const [holder, setHolder] = useState('');
  const [account, setAccount] = useState('');
  const [ifsc, setIfsc] = useState('');
  const [upi, setUpi] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const b = cur.data;
    setHolder(b?.holder || a?.user.name || '');
    setIfsc(b?.ifsc ?? '');
    setUpi(b?.upi ?? '');
  }, [cur.data, a?.user.name]);
  const bankOk = account.length >= 9 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  const upiOk = /^[a-z0-9.\-_]{2,256}@[a-z]{2,64}$/.test(upi);
  const save = async () => {
    setBusy(true);
    try {
      await api('/advocate/payout-account', { method: 'PUT', body: { holder: holder.trim(), account: bankOk ? account : '', ifsc: bankOk ? ifsc : '', upi: upiOk ? upi : '' } });
      navigation.goBack();
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Could not save'), errText(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Bank and UPI" onBack={() => navigation.goBack()} />
      <Body>
        {cur.data?.accountLast4 ? <Note tone="neutral">{tr('Saved account ending {n}. To keep it, enter the account number again.', { n: cur.data.accountLast4 })}</Note> : null}
        <Field label="Account holder name" value={holder} onChangeText={setHolder} />
        <Field label="Account number" value={account} onChangeText={t => setAccount(t.replace(/\D/g, '').slice(0, 18))} keyboardType="number-pad" />
        <Field label="IFSC" value={ifsc} onChangeText={t => setIfsc(t.toUpperCase().slice(0, 11))} placeholder="e.g. HDFC0001234" />
        <T w="bold" size={13} color={colors.muted} center>
          or
        </T>
        <Field label="UPI ID" value={upi} onChangeText={t => setUpi(t.trim().toLowerCase())} placeholder="name@bank" autoCapitalize="none" />
        <Note icon={ShieldCheck}>The account must be in your name. It is stored encrypted; only the last 4 digits are ever shown.</Note>
      </Body>
      <BottomBar>
        <Button title="Save" disabled={holder.trim().length < 2 || !(bankOk || upiOk)} loading={busy} onPress={save} />
      </BottomBar>
    </View>
  );
}

/* ---------- profile ---------- */

export function AdvProfile({ navigation }: P) {
  const { meta, prefs, logout } = useApp();
  const a = useAdvocateMe();
  const acct = useApi<{ accountLast4: string; upi: string } | null>('/advocate/payout-account');
  useLang();
  if (!a) return null;
  const approved = a.documents.every(d => d.status === 'approved');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Profile" />
      <Body>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <SecureImage path={a.hasPhoto ? '/advocate/photo' : null} style={{ width: 56, height: 56, borderRadius: 28, borderWidth: 2, borderColor: colors.gold }} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={17} raw>
              {'Adv. ' + a.user.name}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {'+91 ' + phonePretty(a.user.phone)}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {a.enrolmentNumber + ' · ' + a.district}
            </T>
          </View>
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={IdCard} title="Membership card" onPress={() => navigation.navigate('MembershipCard')} />
          <Divider />
          <ListRow icon={FileCheck} title="My documents" sub={approved ? tr('All approved') : tr('In review')} onPress={() => navigation.navigate('AdvDocuments')} />
          <Divider />
          <ListRow icon={Briefcase} title="Practice details" sub={a.practice.map(p => categoryOf(p, meta).short).join(', ')} onPress={() => navigation.navigate('AdvPractice')} />
          <Divider />
          <ListRow icon={Landmark} title="Bank and UPI" sub={acct.data ? acct.data.upi || '••' + acct.data.accountLast4 : tr('Not added')} onPress={() => navigation.navigate('Bank')} />
          <Divider />
          <ListRow icon={CreditCard} title="My invoices" sub="Membership GST invoices" onPress={() => navigation.navigate('Invoices')} />
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={Globe} title="Language" sub={LANGS.find(l => l.code === prefs.lang)?.native} onPress={() => navigation.navigate('Language', { change: true })} />
          <Divider />
          <ListRow icon={CircleHelp} title="Help desk" sub="Talk to the Vakeel Bhai team" onPress={() => navigation.navigate('Help')} />
          <Divider />
          <ListRow icon={SettingsIcon} title="Settings" onPress={() => navigation.navigate('Settings')} />
          <Divider />
          <ListRow
            icon={LogOut}
            title="Log out"
            danger
            onPress={() =>
              Alert.alert(tr('Log out?'), tr('You can log in again with your mobile number.'), [
                { text: tr('Cancel'), style: 'cancel' },
                { text: tr('Log out'), style: 'destructive', onPress: async () => { await logout(); resetTo(navigation, { name: 'Role' }); } },
              ])
            }
          />
        </Card>
        <T size={12} color={colors.faint} center raw>
          Vakeel Bhai 1.0.0
        </T>
      </Body>
    </View>
  );
}

export function AdvDocuments({ navigation }: P) {
  const a = useAdvocateMe();
  if (!a) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="My documents" onBack={() => navigation.goBack()} />
      <Body gap={10}>
        {DOC_STEPS.map(d => {
          const doc = a.documents.find(x => x.key === d.key);
          return (
            <Card key={d.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <SecureImage path={doc && doc.status !== 'missing' ? docPath(d.key) : null} version={doc?.version} fallback="image" style={{ width: 64, height: 64, borderRadius: 10 }} />
              <View style={{ flex: 1, gap: 6 }}>
                <T w="semibold" size={14}>
                  {d.title}
                </T>
                <Pill label={doc?.status === 'approved' ? 'Approved' : doc?.status === 'reupload' ? 'Retake' : 'In review'} tone={doc?.status === 'approved' ? 'green' : 'orange'} dot={false} />
              </View>
            </Card>
          );
        })}
        <Note icon={ShieldCheck}>To change an approved document, contact support. A change sends your profile for review again.</Note>
      </Body>
    </View>
  );
}
