import React, { useState } from 'react';
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
import {
  AppBar,
  Avatar,
  BillRow,
  Body,
  BottomBar,
  Button,
  Card,
  Chip,
  Divider,
  EmptyState,
  Field,
  IconBtn,
  InkHeader,
  ListRow,
  Note,
  Pill,
  Radio,
  SectionHeader,
  Tap,
  Timeline,
  useBarStyle,
} from '../components/ui';
import { CASE_STATUS, Emblem, IMG, MembershipCard } from '../components/brand';
import { CategoryArt } from '../components/art';
import { colors, categoryTone } from '../theme';
import { CATEGORIES, categoryOf, CategoryKey, DISTRICTS, DOC_STEPS, DocKey, PLANS, STATES } from '../data/catalog';
import { AdvCase, useApp } from '../store/AppStore';
import { advocatePayout, inr } from '../utils/money';
import { ago, dateShort, greeting, phonePretty } from '../utils/format';
import { choosePhoto, openWhatsApp, takePhoto } from '../utils/media';
import { resetTo } from './auth';
import { LANGS, tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

const TOTAL_STEPS = 8;

function StepHeader({ step, title, sub, onBack }: { step: number; title: string; sub?: string; onBack?: () => void }) {
  return (
    <InkHeader style={{ paddingLeft: 8, paddingBottom: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44 }}>
        {onBack ? <IconBtn icon={ArrowLeft} label="Back" color={colors.white} onPress={onBack} /> : <View style={{ width: 12 }} />}
        <T size={13} w="semibold" color={colors.onInkMuted} style={{ flex: 1 }} raw>
          {tr('Verification') + ' · ' + tr('Step {a} of {b}', { a: step, b: TOTAL_STEPS })}
        </T>
        <Tap onPress={() => openWhatsApp('Advocate verification')} hitSlop={8} style={{ paddingHorizontal: 8 }}>
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

function ChipRow({ items, value, onChange }: { items: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {[value, ...items.filter(d => d !== value)].map(d => (
        <Chip key={d} label={d} raw active={value === d} onPress={() => onChange(d)} />
      ))}
    </ScrollView>
  );
}

/* ---------- 1. personal details ---------- */

export function AdvDetails({ navigation }: P) {
  const { s, saveAdvocate } = useApp();
  const a = s.advocate;
  const [name, setName] = useState(a.name);
  const [email, setEmail] = useState(a.email);
  const [address, setAddress] = useState(a.address);
  const [state, setState] = useState(a.state);
  const [district, setDistrict] = useState(a.district);
  const [photo, setPhoto] = useState(a.photo);
  const ok = name.trim().length >= 3 && /\S+@\S+\.\S+/.test(email) && address.trim().length >= 5 && !!photo;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={1} title="Your details" sub="As written on your Bar Council enrolment" />
      <Body>
        <View style={{ alignItems: 'center', gap: 10 }}>
          <Tap
            onPress={async () => {
              const u = await takePhoto(true);
              if (u) setPhoto(u);
            }}
            accessibilityLabel={tr('Take profile photo')}
            style={{ width: 104, height: 104, borderRadius: 52, backgroundColor: colors.white, borderWidth: 2, borderColor: photo ? colors.gold : colors.lineStrong, borderStyle: photo ? 'solid' : 'dashed', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {photo ? <Image source={{ uri: photo }} style={{ width: 100, height: 100 }} /> : <Camera size={30} color={colors.muted} />}
          </Tap>
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <Tap onPress={async () => { const u = await takePhoto(true); if (u) setPhoto(u); }} hitSlop={8}>
              <T w="semibold" size={13} color={colors.goldText}>
                {photo ? 'Retake selfie' : 'Take a selfie'}
              </T>
            </Tap>
            <Tap onPress={async () => { const u = await choosePhoto(); if (u) setPhoto(u); }} hitSlop={8}>
              <T w="semibold" size={13} color={colors.goldText}>
                Choose photo
              </T>
            </Tap>
          </View>
          <T size={12} color={colors.muted}>
            Clients see this photo after you accept their request
          </T>
        </View>
        <Field label="Full name" value={name} onChangeText={setName} placeholder="e.g. Rohan Malhotra" />
        <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" placeholder="name@example.com" />
        <Field label="Address" value={address} onChangeText={setAddress} placeholder="Chamber or office address" />
        <View style={{ gap: 8 }}>
          <T w="semibold" size={13} color={colors.text2}>
            State
          </T>
          <ChipRow items={STATES} value={state} onChange={setState} />
        </View>
        <View style={{ gap: 8 }}>
          <T w="semibold" size={13} color={colors.text2}>
            District
          </T>
          <ChipRow items={DISTRICTS} value={district} onChange={setDistrict} />
        </View>
        <T size={12} color={colors.muted} raw>
          {tr('Mobile') + ': +91 ' + phonePretty(s.phone)}
        </T>
      </Body>
      <BottomBar>
        <Button
          title="Next"
          disabled={!ok}
          onPress={() => {
            saveAdvocate({ name: name.trim().replace(/^adv\.?\s*/i, ''), email: email.trim(), address: address.trim(), state, district, photo });
            navigation.navigate('AdvPractice');
          }}
        />
        {!photo ? (
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
  const { s, saveAdvocate } = useApp();
  const a = s.advocate;
  const [practice, setPractice] = useState<CategoryKey[]>(a.practice);
  const [years, setYears] = useState(a.years);
  const [courts, setCourts] = useState(a.courts || (a.district ? a.district + ' District Court' : ''));
  const [enrol, setEnrol] = useState(a.enrolment);
  const ok = practice.length > 0 && /^\d{1,2}$/.test(years) && courts.trim().length > 2 && enrol.trim().length >= 5;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={2} title="Your practice" sub="We send you requests from these areas only" onBack={() => navigation.goBack()} />
      <Body>
        <T w="semibold" size={13} color={colors.text2}>
          Practice areas (pick one or more)
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {CATEGORIES.map(c => {
            const on = practice.includes(c.key);
            return (
              <Tap
                key={c.key}
                onPress={() => setPractice(on ? practice.filter(x => x !== c.key) : [...practice, c.key])}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                style={{ width: '48%', flexGrow: 1, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 8, borderRadius: 12, backgroundColor: on ? colors.goldTint : colors.white, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line }}>
                <CategoryArt k={c.key} size={40} radius={9} />
                <T w="semibold" size={13} style={{ flex: 1 }}>
                  {c.short}
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
      <BottomBar>
        <Button
          title="Next: documents"
          disabled={!ok}
          onPress={() => {
            saveAdvocate({ practice, years, courts: courts.trim(), enrolment: enrol.trim() });
            // Editing later from the profile goes back; first time continues to the documents.
            if (a.verification !== 'none') navigation.goBack();
            else navigation.navigate('AdvDoc', { i: 0 });
          }}
        />
      </BottomBar>
    </View>
  );
}

/* ---------- 3–7. one document per screen ---------- */

export function AdvDoc({ navigation, route }: P) {
  const { s, setDoc } = useApp();
  useLang();
  const i: number = route.params?.i ?? 0;
  const retake: boolean = !!route.params?.retake;
  const d = DOC_STEPS[i];
  const existing = s.advocate.docs[d.key];
  const [uri, setUri] = useState<string | undefined>(retake ? undefined : existing?.uri);
  const next = () => {
    if (!uri) return;
    setDoc(d.key as DocKey, uri);
    if (retake) navigation.goBack();
    else if (i < DOC_STEPS.length - 1) navigation.push('AdvDoc', { i: i + 1 });
    else navigation.navigate('AdvReview');
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={3 + Math.min(i, 4)} title={d.title} sub={d.hint} onBack={() => navigation.goBack()} />
      <Body>
        <View style={{ height: 280, borderRadius: 16, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
          {uri ? (
            <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
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
        {existing?.status === 'reupload' && existing.note ? (
          <Note tone="orange" icon={TriangleAlert}>
            {tr('Our team asked for a retake') + ': "' + tr(existing.note) + '"'}
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
        {uri ? (
          <>
            <Button title={retake ? 'Use this photo' : i < DOC_STEPS.length - 1 ? 'Use this photo' : 'Review and submit'} onPress={next} />
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
  const { s, submitVerification } = useApp();
  const a = s.advocate;
  const missing = DOC_STEPS.filter(d => !a.docs[d.key]?.uri);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StepHeader step={8} title="Review and submit" sub="Check everything once. Our team verifies it within 12 to 24 hours." onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <Body>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Avatar source={a.photo ? { uri: a.photo } : undefined} size={52} ring />
          <View style={{ flex: 1 }}>
            <T w="bold" size={15} raw>
              {'Adv. ' + a.name}
            </T>
            <T size={12} color={colors.muted} raw>
              {a.practice.map(p => tr(categoryOf(p).short)).join(', ') + ' · ' + a.years + ' ' + tr('yrs')}
            </T>
            <T size={12} color={colors.muted} raw>
              {a.enrolment + ' · ' + a.district}
            </T>
          </View>
          <IconBtn icon={Pencil} label="Edit details" onPress={() => navigation.popTo('AdvDetails')} />
        </Card>
        <Card style={{ padding: 4 }}>
          {DOC_STEPS.map((d, i) => {
            const doc = a.docs[d.key];
            return (
              <View key={d.key}>
                {i ? <Divider /> : null}
                <Tap onPress={() => navigation.navigate('AdvDoc', { i, retake: !!doc })} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10 }}>
                  {doc?.uri ? (
                    <Image source={{ uri: doc.uri }} style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surface2 }} />
                  ) : (
                    <View style={{ width: 48, height: 48, borderRadius: 8, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                      <Camera size={20} color={colors.muted} />
                    </View>
                  )}
                  <T w="semibold" size={13.5} style={{ flex: 1 }}>
                    {d.title}
                  </T>
                  {doc?.uri ? <Pill label="Added" tone="green" dot={false} /> : <Pill label="Missing" tone="orange" dot={false} />}
                </Tap>
              </View>
            );
          })}
        </Card>
        <Note icon={ShieldCheck}>Only the Vakeel Bhai verification team can see your documents. Aadhaar is never shown to clients.</Note>
      </Body>
      <BottomBar>
        <Button
          title="Submit for verification"
          disabled={missing.length > 0}
          onPress={() => {
            submitVerification();
            resetTo(navigation, { name: 'AdvStatus' });
          }}
        />
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
  const { s, demoVerify } = useApp();
  useLang();
  const a = s.advocate;
  const re = a.verification === 'reupload';
  const ok = a.verification === 'approved';
  const retakeKeys = DOC_STEPS.map((d, i) => ({ d, i })).filter(x => a.docs[x.d.key]?.status === 'reupload');
  const docTone = (st?: string) => (st === 'approved' ? 'green' : st === 'reupload' ? 'orange' : 'neutral');
  const docLabel = (st?: string) => (st === 'approved' ? 'Approved' : st === 'reupload' ? 'Retake' : 'In review');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ paddingBottom: 16, gap: 8 }}>
        <View style={{ width: 44, height: 44, borderRadius: 12, borderWidth: 1.5, borderColor: ok ? colors.green : colors.gold, alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
          {ok ? <ShieldCheck size={22} color={colors.green} /> : <Clock size={22} color={colors.gold} />}
        </View>
        <T w="serif" size={21} color={colors.white}>
          {ok ? 'You are verified' : re ? 'Almost there' : 'Verification in progress'}
        </T>
        <T size={14} color={colors.onInkMuted} lh={21}>
          {ok
            ? 'Your documents are approved. Choose a membership to start receiving client requests.'
            : re
              ? 'Our team needs one document again. Retake it and we will finish the check.'
              : 'Our team is checking your Bar Council documents. This usually takes 12 to 24 hours.'}
        </T>
      </InkHeader>
      <Body gap={14}>
        {re && retakeKeys.length ? (
          <View style={{ backgroundColor: '#FDF3EA', borderWidth: 1, borderColor: '#F3D9C2', borderRadius: 14, padding: 14, gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TriangleAlert size={20} color={colors.orange} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={14} color={colors.orangeText} raw>
                  {tr('{n} document needs a retake', { n: retakeKeys.length })}
                </T>
                {retakeKeys.map(x => (
                  <T key={x.d.key} size={13} color={colors.orangeText} lh={19} raw>
                    {tr(x.d.title) + ': "' + tr(a.docs[x.d.key]?.note ?? '') + '"'}
                  </T>
                ))}
              </View>
            </View>
            {retakeKeys.map(x => (
              <Button key={x.d.key} title={tr('Retake') + ' ' + tr(x.d.title)} variant="ink" small onPress={() => navigation.navigate('AdvDoc', { i: x.i, retake: true })} />
            ))}
          </View>
        ) : null}

        <Card>
          <Timeline
            steps={[
              { title: 'Profile submitted', sub: a.submittedAt ? dateShort(a.submittedAt) : undefined, state: 'done' },
              { title: 'Documents uploaded', sub: tr('{n} documents', { n: DOC_STEPS.length }), state: 'done' },
              { title: 'Admin review', sub: ok ? tr('Approved') : re ? tr('Waiting for your retake') : tr('Usually within 24 hours'), state: ok ? 'done' : 'now' },
              { title: 'Choose a membership', sub: tr('You start receiving client requests after this'), state: ok ? 'now' : 'todo' },
            ]}
          />
        </Card>

        <Card style={{ paddingVertical: 4 }}>
          <T w="bold" size={14} style={{ paddingVertical: 10 }}>
            Your documents
          </T>
          {DOC_STEPS.map(d => (
            <View key={d.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
              {a.docs[d.key]?.uri ? (
                <Image source={{ uri: a.docs[d.key]!.uri }} style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: colors.surface2 }} />
              ) : (
                <View style={{ width: 40, height: 40, borderRadius: 8, backgroundColor: '#F4EEDD', alignItems: 'center', justifyContent: 'center' }}>
                  <FileCheck size={18} color={colors.goldText} />
                </View>
              )}
              <T w="semibold" size={13} style={{ flex: 1 }}>
                {d.title}
              </T>
              <Pill label={docLabel(a.docs[d.key]?.status)} tone={docTone(a.docs[d.key]?.status) as any} dot={false} />
            </View>
          ))}
        </Card>

        {!ok ? (
          <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.lineStrong, borderRadius: 14, padding: 14, gap: 10 }}>
            <T w="bold" size={13} color={colors.muted}>
              Demo build: simulate the admin's decision
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Approve" small style={{ flex: 1 }} onPress={() => demoVerify('approve')} />
              {!re ? <Button title="Ask for a retake" small variant="line" style={{ flex: 1 }} onPress={() => demoVerify('reupload')} /> : null}
            </View>
          </View>
        ) : null}
      </Body>
      <BottomBar>
        {ok ? (
          <Button title="Choose a membership" onPress={() => navigation.navigate('Plans')} />
        ) : (
          <Button title="Questions? WhatsApp support" variant="line" icon={MessageCircle} onPress={() => openWhatsApp('Advocate verification')} />
        )}
      </BottomBar>
    </View>
  );
}

/* ---------- membership ---------- */

export function Plans({ navigation, route }: P) {
  const { s, buyMembership } = useApp();
  useLang();
  const renewing = !!route.params?.renew;
  const [plan, setPlan] = useState(s.advocate.membership?.planId ?? 'year');
  const [paying, setPaying] = useState(false);
  const sel = PLANS.find(p => p.id === plan)!;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={renewing ? 'Renew membership' : 'Membership'} onBack={navigation.canGoBack() ? () => navigation.goBack() : undefined} />
      <Body>
        {!renewing ? <Note icon={ShieldCheck}>Documents approved. One step left.</Note> : null}
        <MembershipCard adv={s.advocate} planName={sel.name} preview={!s.advocate.membership} />
        <T w="bold" size={17} style={{ marginTop: 4 }}>
          Choose a plan
        </T>
        {PLANS.map(p => {
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
                  <T w="bold" size={15}>
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
                <T size={12} color={colors.muted}>
                  {p.note}
                </T>
              </View>
              <T w="extrabold" size={15} raw>
                {p.price ? inr(p.price) : '[PRICE]'}
              </T>
            </Tap>
          );
        })}
        <Card style={{ gap: 10 }}>
          <T w="bold" size={14}>
            Every plan includes
          </T>
          {[
            'Client requests in your practice areas and district',
            'Verified badge and a digital membership card',
            'Wallet with a full commission and GST breakup, withdrawals to your bank',
            'GST invoice for your membership fee',
          ].map(t => (
            <View key={t} style={{ flexDirection: 'row', gap: 10 }}>
              <Check size={18} color={colors.green} />
              <T size={13} w="medium" color={colors.text2} lh={19} style={{ flex: 1 }}>
                {t}
              </T>
            </View>
          ))}
        </Card>
        <Note tone="gold">Prices are set by the admin before launch. Demo build: the plan activates without payment.</Note>
      </Body>
      <BottomBar row>
        <View>
          <T w="extrabold" size={18} raw>
            {sel.price ? inr(sel.price) : '[PRICE]'}
          </T>
          <T size={11.5} w="medium" color={colors.muted} raw>
            {'+ 18% GST · ' + tr(sel.name)}
          </T>
        </View>
        <Button
          title={paying ? 'Activating…' : renewing ? 'Renew' : 'Pay and activate'}
          loading={paying}
          style={{ flex: 1 }}
          onPress={() => {
            setPaying(true);
            setTimeout(() => {
              buyMembership(plan);
              if (renewing) navigation.goBack();
              else resetTo(navigation, { name: 'AdvTabs' });
            }, 1200);
          }}
        />
      </BottomBar>
    </View>
  );
}

export function MembershipCardScreen({ navigation }: P) {
  const { s } = useApp();
  const m = s.advocate.membership;
  const plan = PLANS.find(p => p.id === m?.planId);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Membership card" onBack={() => navigation.goBack()} />
      <Body>
        <MembershipCard adv={s.advocate} />
        <Card style={{ gap: 10 }}>
          <BillRow label="Plan" value={tr(plan?.name ?? '')} />
          <BillRow label="Member ID" value={m?.memberId ?? '—'} />
          <BillRow label="Started" value={m ? dateShort(m.start) : '—'} />
          <BillRow label="Valid till" value={m ? dateShort(m.end) : '—'} />
          <BillRow label="Status" value={m && m.end > Date.now() ? tr('Active') : tr('Expired')} color={colors.green} />
        </Card>
        <Note icon={ShieldCheck}>Clients and courts can scan the QR code to check your verification with Vakeel Bhai.</Note>
      </Body>
      <BottomBar>
        <Button title="Renew or change plan" variant="line" onPress={() => navigation.navigate('Plans', { renew: true })} />
      </BottomBar>
    </View>
  );
}

/* ---------- dashboard ---------- */

const clientImg = (c: AdvCase) => (c.clientPhoto === 'gurpreet' ? IMG.gurpreet : c.clientPhoto === 'ananya' ? IMG.ananya : null);

function ClientAvatar({ c, size = 38 }: { c: AdvCase; size?: number }) {
  const img = clientImg(c);
  return img ? (
    <Avatar source={img} size={size} />
  ) : (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
      <User size={size * 0.47} color="#4A4740" />
    </View>
  );
}

function CaseRow({ c, onPress }: { c: AdvCase; onPress: () => void }) {
  const st = CASE_STATUS[c.status];
  return (
    <Tap onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
      <ClientAvatar c={c} />
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14} raw numberOfLines={1}>
          {c.clientName + ' · ' + tr(categoryOf(c.category).short)}
        </T>
        <T size={12} w="medium" color={colors.muted} raw numberOfLines={1}>
          {tr(c.title) + ' · ' + c.id}
        </T>
      </View>
      <Pill label={st.label} tone={st.tone} dot={false} />
    </Tap>
  );
}

export function AdvDashboard({ navigation }: P) {
  const { s, acceptCase } = useApp();
  useLang();
  const a = s.advocate;
  const m = a.membership;
  const plan = PLANS.find(p => p.id === m?.planId);
  const fresh = s.cases.filter(c => c.status === 'new');
  const active = s.cases.filter(c => ['accepted', 'quoted', 'paid', 'done'].includes(c.status));
  const month = new Date().getMonth();
  const earnedTx = a.tx.filter(t => t.type === 'earn' && new Date(t.at).getMonth() === month);
  const gross = earnedTx.reduce((acc, t) => acc + advocateFeeFromNet(t.amount), 0);
  const pay = advocatePayout(gross);
  const unread = s.notices.some(n => !n.read);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Avatar source={a.photo ? { uri: a.photo } : IMG.rohan} size={44} ring />
          <View style={{ flex: 1 }}>
            <T size={12} w="medium" color={colors.onInkMuted}>
              {greeting()}
            </T>
            <T w="bold" size={17} color={colors.white} raw numberOfLines={1}>
              {'Adv. ' + a.name}
            </T>
          </View>
          <IconBtn icon={Bell} label="Notifications" color={colors.white} bordered="dark" badge={unread} onPress={() => navigation.navigate('Notifications')} />
        </View>
        <Tap onPress={() => navigation.navigate('MembershipCard')} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.ink2, borderWidth: 1, borderColor: colors.inkLine, borderRadius: 12, padding: 10 }}>
          <Emblem size={26} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={13} color={colors.gold} raw>
              {tr((plan?.name ?? '') + ' member') + ' · ' + (m?.memberId ?? '')}
            </T>
            <T size={12} w="medium" color={colors.onInkMuted} raw>
              {tr('Active till') + ' ' + (m ? dateShort(m.end) : '—') + ' · ' + tr('View card')}
            </T>
          </View>
          <ChevronRight size={18} color={colors.onInkMuted} />
        </Tap>
      </InkHeader>
      <Body gap={18}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          <Stat label="Wallet balance" value={inr(a.wallet)} onPress={() => navigation.navigate('AdvWallet')} />
          <Stat label="Earned this month" value={inr(earnedTx.reduce((x, t) => x + t.amount, 0))} />
          <Stat label="Active cases" value={String(active.length)} onPress={() => navigation.navigate('Cases')} />
          <Stat label="Rating" value={a.rating ? a.rating.toFixed(1) : '—'} />
        </View>

        <View style={{ gap: 10 }}>
          <SectionHeader title={tr('New requests') + ' · ' + fresh.length} action="All cases" onAction={() => navigation.navigate('Cases')} />
          {fresh.length === 0 ? (
            <Card>
              <T size={13} color={colors.muted}>
                No new requests right now. Our team assigns requests that match your practice areas and district.
              </T>
            </Card>
          ) : (
            fresh.map(c => (
              <Card key={c.id} style={{ borderColor: colors.ink, borderWidth: 1.5, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <View style={{ backgroundColor: categoryTone[c.category].bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                    <T w="semibold" size={11.5} color={categoryTone[c.category].fg}>
                      {categoryOf(c.category).short}
                    </T>
                  </View>
                  <T size={12} w="medium" color={colors.muted} raw>
                    {c.id + ' · ' + tr('assigned by admin') + ' ' + ago(c.assignedAt)}
                  </T>
                </View>
                <T w="bold" size={15}>
                  {c.title}
                </T>
                <T size={13} color={colors.text2} lh={19} raw>
                  {'"' + c.issue + '" · ' + c.district + ' · ' + c.lang}
                </T>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title="Accept" small style={{ flex: 1 }} onPress={() => { acceptCase(c.id); navigation.navigate('CaseDetail', { id: c.id }); }} />
                  <Button title="View" small variant="line" onPress={() => navigation.navigate('CaseDetail', { id: c.id })} />
                </View>
              </Card>
            ))
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

        <Card style={{ gap: 9 }}>
          <T w="bold" size={15}>
            This month's earnings
          </T>
          <BillRow label={tr('Fees from {n} completed cases', { n: earnedTx.length })} value={inr(pay.base)} raw />
          <BillRow label="Platform commission (20%)" value={'−' + inr(pay.commission)} />
          <BillRow label="GST on commission (18%)" value={'−' + inr(pay.gstOnCommission)} />
          <Divider />
          <BillRow label="Credited to wallet" value={inr(pay.net)} strong />
        </Card>
      </Body>
    </View>
  );
}

/** Inverse of advocatePayout at the default rates (net = 0.764 × fee). */
function advocateFeeFromNet(net: number) {
  return Math.round(net / 0.764);
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
  const { s } = useApp();
  useLang();
  const [tab, setTab] = useState<'new' | 'active' | 'done'>('active');
  const groups = {
    new: s.cases.filter(c => c.status === 'new'),
    active: s.cases.filter(c => ['accepted', 'quoted', 'paid', 'done'].includes(c.status)),
    done: s.cases.filter(c => ['completed', 'declined'].includes(c.status)),
  };
  const list = groups[tab];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Cases" />
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {(['new', 'active', 'done'] as const).map(k => (
          <Tap key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
            <T w="semibold" size={14} color={tab === k ? colors.ink : colors.muted} raw>
              {tr(k === 'new' ? 'New' : k === 'active' ? 'Active' : 'Completed') + ' (' + groups[k].length + ')'}
            </T>
          </Tap>
        ))}
      </View>
      <Body gap={10}>
        {list.length === 0 ? (
          <EmptyState icon={Briefcase} title="Nothing here yet" sub="Requests assigned by our team appear under New." />
        ) : (
          list.map(c => (
            <Card key={c.id} onPress={() => navigation.navigate('CaseDetail', { id: c.id })} style={{ paddingVertical: 2 }}>
              <CaseRow c={c} onPress={() => navigation.navigate('CaseDetail', { id: c.id })} />
            </Card>
          ))
        )}
      </Body>
    </View>
  );
}

const DECLINE = ['Not my practice area', 'Too many active cases', 'Conflict of interest', 'Not available this week'];

export function CaseDetail({ navigation, route }: P) {
  const { s, acceptCase, declineCase, markDone } = useApp();
  useLang();
  const c = s.cases.find(x => x.id === route.params?.id);
  const [declining, setDeclining] = useState(false);
  if (!c) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const st = CASE_STATUS[c.status];
  const cat = categoryOf(c.category);
  const pay = c.quote ? advocatePayout(c.quote.fee) : null;
  const order = ['new', 'accepted', 'quoted', 'paid', 'done', 'completed'];
  const at = order.indexOf(c.status);
  const step = (i: number) => (c.status === 'completed' || i <= at ? 'done' : i === at + 1 ? 'now' : 'todo') as 'done' | 'now' | 'todo';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={cat.name} sub={c.id} onBack={() => navigation.goBack()} right={<Pill label={st.label} tone={st.tone} />} />
      <Body>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <ClientAvatar c={c} size={44} />
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
          <T w="bold" size={15}>
            {c.title}
          </T>
          <T size={13.5} color={colors.text2} lh={20} raw>
            {c.issue}
          </T>
          <T size={12} color={colors.muted} raw>
            {tr('Assigned') + ' ' + ago(c.assignedAt)}
          </T>
        </Card>

        {c.status !== 'declined' ? (
          <Card>
            <Timeline
              steps={[
                { title: 'Assigned to you', state: step(0) },
                { title: 'Accepted', state: step(1) },
                { title: 'Quote sent', sub: c.quote ? inr(c.quote.fee) : undefined, state: step(2) },
                { title: 'Client paid', sub: c.status === 'quoted' ? tr('Waiting for the client') : undefined, state: step(3) },
                { title: 'Work done', sub: c.status === 'done' ? tr('Waiting for the client to confirm') : undefined, state: step(4) },
                { title: 'Paid to wallet', state: step(5) },
              ]}
            />
          </Card>
        ) : (
          <Note tone="neutral">{tr('You declined this request') + (c.declineReason ? ': ' + tr(c.declineReason) : '') + '. ' + tr('It went back to the admin queue.')}</Note>
        )}

        {pay ? (
          <Card style={{ gap: 9 }}>
            <T w="bold" size={14}>
              Your payout
            </T>
            <BillRow label="Fee quoted" value={inr(pay.base)} />
            <BillRow label="Platform commission (20%)" value={'−' + inr(pay.commission)} />
            <BillRow label="GST on commission (18%)" value={'−' + inr(pay.gstOnCommission)} />
            <Divider />
            <BillRow label={c.status === 'completed' ? 'Credited to wallet' : 'You will receive'} value={inr(pay.net)} strong />
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
                    declineCase(c.id, r);
                    setDeclining(false);
                  }}
                />
              ))}
            </View>
          </Card>
        ) : null}
        {c.status === 'paid' ? <Note tone="gold">Demo build: the client confirms about 12 seconds after you mark the work as done.</Note> : null}
        {c.status === 'quoted' ? <Note tone="gold">Demo build: the client pays your quote in about 10 seconds.</Note> : null}
      </Body>
      <BottomBar>
        {c.status === 'new' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Accept request" style={{ flex: 1 }} onPress={() => acceptCase(c.id)} />
            <Button title="Decline" variant="line" onPress={() => setDeclining(!declining)} />
          </View>
        ) : c.status === 'accepted' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="Send quote" style={{ flex: 1 }} onPress={() => navigation.navigate('SendQuote', { id: c.id })} />
            <Button title="Chat" variant="line" icon={MessageCircle} onPress={() => navigation.navigate('Chat', { chatId: 'case:' + c.id })} />
          </View>
        ) : c.status === 'paid' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button
              title="Mark work as done"
              style={{ flex: 1 }}
              onPress={() =>
                Alert.alert(tr('Mark as done?'), tr('The client will be asked to confirm. Payment is released after they confirm.'), [
                  { text: tr('Cancel'), style: 'cancel' },
                  { text: tr('Mark as done'), onPress: () => markDone(c.id) },
                ])
              }
            />
            <Button title="Chat" variant="line" icon={MessageCircle} onPress={() => navigation.navigate('Chat', { chatId: 'case:' + c.id })} />
          </View>
        ) : c.status !== 'declined' ? (
          <Button title="Open chat" variant="ink" icon={MessageCircle} onPress={() => navigation.navigate('Chat', { chatId: 'case:' + c.id })} />
        ) : (
          <Button title="Back to cases" variant="line" onPress={() => navigation.goBack()} />
        )}
      </BottomBar>
    </View>
  );
}

export function SendQuote({ navigation, route }: P) {
  const { s, sendQuote } = useApp();
  const c = s.cases.find(x => x.id === route.params?.id);
  const [fee, setFee] = useState(c ? String(categoryOf(c.category).demoFee) : '');
  const [scope, setScope] = useState(c ? categoryOf(c.category).demoScope : '');
  if (!c) return null;
  const n = Number(fee) || 0;
  const pay = advocatePayout(n);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Send a fee quote" sub={c.id + ' · ' + c.clientName} onBack={() => navigation.goBack()} />
      <Body>
        <Field label="Your fee (₹)" value={fee} onChangeText={t => setFee(t.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" prefix="₹" big />
        <Field label="What this fee covers" value={scope} onChangeText={setScope} multiline placeholder="e.g. Drafting and filing the petition, 2 court appearances" />
        <Card style={{ gap: 9 }}>
          <T w="bold" size={14}>
            What you will receive
          </T>
          <BillRow label="Client pays (before GST)" value={inr(pay.base)} />
          <BillRow label="Platform commission (20%)" value={'−' + inr(pay.commission)} />
          <BillRow label="GST on commission (18%)" value={'−' + inr(pay.gstOnCommission)} />
          <Divider />
          <BillRow label="You receive" value={inr(pay.net)} strong />
        </Card>
        <Note tone="neutral">If the client uses an offer, commission and GST are calculated on the discounted amount. The commission rate is set by Vakeel Bhai.</Note>
      </Body>
      <BottomBar>
        <Button
          title="Send quote in chat"
          disabled={n < 100 || scope.trim().length < 10}
          onPress={() => {
            sendQuote(c.id, n, scope.trim());
            navigation.replace('Chat', { chatId: 'case:' + c.id });
          }}
        />
      </BottomBar>
    </View>
  );
}

/* ---------- wallet ---------- */

export function AdvWallet({ navigation }: P) {
  const { s } = useApp();
  useLang();
  const a = s.advocate;
  const [f, setF] = useState<'all' | 'earn' | 'withdraw' | 'fee'>('all');
  const rows = a.tx.filter(t => f === 'all' || t.type === f);
  const [open, setOpen] = useState<string | null>(rows.find(r => r.lines)?.id ?? null);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Wallet" right={<Tap onPress={() => navigation.navigate('Bank')} hitSlop={8} style={{ paddingHorizontal: 8 }}><T w="semibold" size={13} color={colors.goldText}>Bank & UPI</T></Tap>} />
      <Body>
        <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 18, gap: 14 }}>
          <View>
            <T size={12} w="medium" color={colors.onInkMuted}>
              Available to withdraw
            </T>
            <T w="extrabold" size={32} color={colors.white} raw>
              {inr(a.wallet)}
            </T>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1, backgroundColor: colors.ink2, borderRadius: 10, padding: 10 }}>
              <T size={11} w="medium" color={colors.onInkMuted}>
                On hold
              </T>
              <T w="bold" size={14} color={colors.white} raw>
                {inr(a.hold)}
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
                {inr(a.lifetime)}
              </T>
              <T size={10.5} w="medium" color="#8A857A">
                after commission
              </T>
            </View>
          </View>
          <Button
            title={a.bank ? tr('Withdraw to') + ' ' + (a.bank.upi || '••' + a.bank.account.slice(-4)) : 'Add bank to withdraw'}
            onPress={() => navigation.navigate(a.bank ? 'Withdraw' : 'Bank')}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(
            [
              ['all', 'All'],
              ['earn', 'Earnings'],
              ['withdraw', 'Withdrawals'],
              ['fee', 'Fees'],
            ] as const
          ).map(([k, l]) => (
            <Chip key={k} label={l} active={f === k} onPress={() => setF(k)} />
          ))}
        </View>
        {rows.length === 0 ? (
          <EmptyState title="Nothing here yet" />
        ) : (
          rows.map(t => {
            const inc = t.amount >= 0 && t.type === 'earn';
            return (
              <Card key={t.id} onPress={t.lines ? () => setOpen(open === t.id ? null : t.id) : undefined} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: inc ? colors.greenSoft : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                    {inc ? <ArrowDownLeft size={19} color={colors.green} /> : t.type === 'fee' ? <CreditCard size={19} color={colors.text2} /> : <ArrowUpRight size={19} color={colors.text2} />}
                  </View>
                  <View style={{ flex: 1 }}>
                    <T w="bold" size={14} raw>
                      {t.title}
                    </T>
                    <T size={12} color={colors.muted} raw>
                      {t.sub + ' · ' + dateShort(t.at)}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T w="extrabold" size={15} color={inc ? colors.green : colors.text} raw>
                      {t.type === 'fee' && !t.amount ? '[PRICE]' : (inc ? '+' : '') + inr(t.amount)}
                    </T>
                    {t.status ? (
                      <T size={11} w="semibold" color={colors.muted}>
                        {t.status}
                      </T>
                    ) : null}
                  </View>
                </View>
                {t.lines && open === t.id ? (
                  <View style={{ backgroundColor: colors.bg, borderRadius: 10, padding: 12, gap: 6 }}>
                    {t.lines.map(l => (
                      <BillRow key={l.k} label={l.k} value={l.v} />
                    ))}
                    <T w="semibold" size={12.5} color={colors.goldText} style={{ marginTop: 2 }}>
                      GST invoice is emailed to you
                    </T>
                  </View>
                ) : null}
              </Card>
            );
          })
        )}
      </Body>
    </View>
  );
}

export function Withdraw({ navigation }: P) {
  const { s, withdraw } = useApp();
  const a = s.advocate;
  const [amt, setAmt] = useState(String(Math.floor(a.wallet)));
  const n = Number(amt) || 0;
  const ok = n >= 100 && n <= a.wallet;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Withdraw" onBack={() => navigation.goBack()} />
      <Body>
        <Field label="Amount (₹)" value={amt} onChangeText={t => setAmt(t.replace(/\D/g, '').slice(0, 7))} keyboardType="number-pad" prefix="₹" big hint={tr('Available') + ': ' + inr(a.wallet)} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {[1000, 5000, 10000].filter(v => v <= a.wallet).map(v => (
            <Chip key={v} label={inr(v)} raw onPress={() => setAmt(String(v))} />
          ))}
          <Chip label="All" onPress={() => setAmt(String(Math.floor(a.wallet)))} />
        </View>
        <Card style={{ padding: 0 }}>
          <ListRow icon={Landmark} title={a.bank?.upi ? a.bank.upi : tr('Bank account') + ' ••' + (a.bank?.account ?? '').slice(-4)} sub={a.bank?.holder} onPress={() => navigation.navigate('Bank')} />
        </Card>
        <Note tone="neutral">Our team approves withdrawals and transfers the money, usually within 2 working days.</Note>
      </Body>
      <BottomBar>
        <Button
          title={tr('Withdraw') + ' ' + inr(n)}
          disabled={!ok}
          onPress={() => {
            withdraw(n);
            navigation.goBack();
          }}
        />
      </BottomBar>
    </View>
  );
}

export function Bank({ navigation }: P) {
  const { s, saveBank } = useApp();
  const b = s.advocate.bank;
  const [holder, setHolder] = useState(b?.holder ?? s.advocate.name);
  const [account, setAccount] = useState(b?.account ?? '');
  const [ifsc, setIfsc] = useState(b?.ifsc ?? '');
  const [upi, setUpi] = useState(b?.upi ?? '');
  const bankOk = account.length >= 9 && /^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc);
  const upiOk = /^[\w.-]+@[\w]+$/.test(upi);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Bank and UPI" onBack={() => navigation.goBack()} />
      <Body>
        <Field label="Account holder name" value={holder} onChangeText={setHolder} />
        <Field label="Account number" value={account} onChangeText={t => setAccount(t.replace(/\D/g, '').slice(0, 18))} keyboardType="number-pad" />
        <Field label="IFSC" value={ifsc} onChangeText={t => setIfsc(t.toUpperCase().slice(0, 11))} placeholder="e.g. HDFC0001234" />
        <T w="bold" size={13} color={colors.muted} center>
          or
        </T>
        <Field label="UPI ID" value={upi} onChangeText={t => setUpi(t.trim().toLowerCase())} placeholder="name@bank" autoCapitalize="none" />
        <Note icon={ShieldCheck}>The account must be in your name. Our team checks it before the first payout.</Note>
      </Body>
      <BottomBar>
        <Button
          title="Save"
          disabled={!holder.trim() || !(bankOk || upiOk)}
          onPress={() => {
            saveBank({ holder: holder.trim(), account, ifsc, upi: upiOk ? upi : '' });
            navigation.goBack();
          }}
        />
      </BottomBar>
    </View>
  );
}

/* ---------- profile ---------- */

export function AdvProfile({ navigation }: P) {
  const { s, logout } = useApp();
  useLang();
  const a = s.advocate;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Profile" />
      <Body>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar source={a.photo ? { uri: a.photo } : IMG.rohan} size={56} ring />
          <View style={{ flex: 1 }}>
            <T w="bold" size={17} raw>
              {'Adv. ' + a.name}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {'+91 ' + phonePretty(s.phone)}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {a.enrolment + ' · ' + a.district}
            </T>
          </View>
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={IdCard} title="Membership card" onPress={() => navigation.navigate('MembershipCard')} />
          <Divider />
          <ListRow icon={FileCheck} title="My documents" sub="All approved" onPress={() => navigation.navigate('AdvDocuments')} />
          <Divider />
          <ListRow icon={Briefcase} title="Practice details" sub={a.practice.map(p => tr(categoryOf(p).short)).join(', ')} onPress={() => navigation.navigate('AdvPractice')} />
          <Divider />
          <ListRow icon={Landmark} title="Bank and UPI" sub={a.bank ? a.bank.upi || '••' + a.bank.account.slice(-4) : tr('Not added')} onPress={() => navigation.navigate('Bank')} />
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={Globe} title="Language" sub={LANGS.find(l => l.code === s.lang)?.native} onPress={() => navigation.navigate('Language', { change: true })} />
          <Divider />
          <ListRow icon={CircleHelp} title="Help and support" onPress={() => navigation.navigate('Help')} />
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
                { text: tr('Log out'), style: 'destructive', onPress: () => { logout(); resetTo(navigation, { name: 'Role' }); } },
              ])
            }
          />
        </Card>
        <T size={12} color={colors.faint} center raw>
          Vakeel Bhai 1.0.0 · demo build
        </T>
      </Body>
    </View>
  );
}

export function AdvDocuments({ navigation }: P) {
  const { s } = useApp();
  const a = s.advocate;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="My documents" onBack={() => navigation.goBack()} />
      <Body gap={10}>
        {DOC_STEPS.map(d => {
          const doc = a.docs[d.key];
          return (
            <Card key={d.key} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              {doc?.uri ? <Image source={{ uri: doc.uri }} style={{ width: 64, height: 64, borderRadius: 10, backgroundColor: colors.surface2 }} /> : null}
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
