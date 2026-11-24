import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, ScrollView, Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Search,
  Lock,

  Camera,
  ChevronRight,
  CircleHelp,
  Copy,
  FileText,
  Gift,
  Globe,
  Image as ImageIcon,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Receipt,
  Settings as SettingsIcon,
  Share2,
  ShieldCheck,
  Star,
  Tag,
  Wallet as WalletIcon,
  X,
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
  SectionHeader,
  Tap,
  Timeline,
  Toggle,
  useBarStyle,
} from '../components/ui';
import { AdvocateRow, IMG, REQ_STATUS } from '../components/brand';
import { CategoryArt, GlowArt } from '../components/art';
import { colors, categoryTone } from '../theme';
import { advocateById, BANNERS, CATEGORIES, Category, categoryOf, CategoryKey, DISTRICTS, OFFERS, STATES, AUTO_CONFIRM_DAYS, CHALLANS } from '../data/catalog';
import { ClientRequest, useApp } from '../store/AppStore';
import { clientBill, inr, offerDiscount } from '../utils/money';
import { ago, dateShort, phonePretty } from '../utils/format';
import { choosePhoto, openWhatsApp, takePhoto } from '../utils/media';
import { resetTo } from './auth';
import { LANGS, tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

/* ---------- profile setup ---------- */

function DistrictPicker({ value, onChange, label = 'City / district' }: { value: string; onChange: (d: string) => void; label?: string }) {
  return (
    <View style={{ gap: 8 }}>
      <T w="semibold" size={13} color={colors.text2}>
        {label}
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[value, ...DISTRICTS.filter(d => d !== value)].map(d => (
          <Chip key={d} label={d} raw active={value === d} onPress={() => onChange(d)} />
        ))}
      </ScrollView>
    </View>
  );
}

export function ClientSetup({ navigation, route }: P) {
  const { s, saveClientProfile } = useApp();
  const editing = route?.params?.edit;
  const [name, setName] = useState(s.client.name);
  const [email, setEmail] = useState(s.client.email);
  const [city, setCity] = useState(s.client.city);
  const [state, setState] = useState(s.client.state);
  const [ref, setRef] = useState(s.client.referredBy);
  const ok = name.trim().length >= 2 && (!email || /\S+@\S+\.\S+/.test(email));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {editing ? (
        <AppBar title="Edit profile" onBack={() => navigation.goBack()} />
      ) : (
        <InkHeader style={{ paddingBottom: 24 }}>
          <T w="serif" size={23} color={colors.white} style={{ marginTop: 6 }}>
            A few details
          </T>
          <T size={14} color={colors.onInkMuted} style={{ marginTop: 6 }}>
            So the right advocate can help you. Takes 30 seconds.
          </T>
        </InkHeader>
      )}
      <Body>
        <Field label="Your name" value={name} onChangeText={setName} placeholder="Full name" autoFocus={!editing} />
        <Field label="Email (for invoices)" value={email} onChangeText={setEmail} placeholder="name@example.com" keyboardType="email-address" />
        <DistrictPicker value={city} onChange={setCity} />
        <View style={{ gap: 8 }}>
          <T w="semibold" size={13} color={colors.text2}>
            State
          </T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {[state, ...STATES.filter(d => d !== state)].map(d => (
              <Chip key={d} label={d} raw active={state === d} onPress={() => setState(d)} />
            ))}
          </ScrollView>
        </View>
        {!editing ? <Field label="Referral code (optional)" value={ref} onChangeText={t => setRef(t.toUpperCase())} placeholder="e.g. VBRAHUL123" /> : null}
      </Body>
      <BottomBar>
        <Button
          title={editing ? 'Save' : 'Continue'}
          disabled={!ok}
          onPress={() => {
            saveClientProfile({ name: name.trim(), email: email.trim(), city, state, referredBy: ref });
            if (editing) navigation.goBack();
            else resetTo(navigation, { name: 'ClientTabs' });
          }}
        />
      </BottomBar>
    </View>
  );
}

export const EditClient = (p: P) => <ClientSetup {...p} route={{ params: { edit: true } }} />;

/* ---------- home ---------- */

export function ClientHome({ navigation }: P) {
  const { s } = useApp();
  useBarStyle(false);
  useLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bannerW = width - 28;
  const [slide, setSlide] = useState(0);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  useEffect(() => {
    const t = setInterval(() => {
      setSlide(i => {
        const n = (i + 1) % BANNERS.length;
        scroller.current?.scrollTo({ x: n * (bannerW + 10), animated: true });
        return n;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [bannerW]);

  const active = s.requests.filter(r => r.status !== 'completed');
  const unread = s.notices.some(n => !n.read);
  const paidIds = s.client.paidChallans.map(p => p.id);
  const myVehicles = s.client.vehicles.map(v => v.number);
  const dueList = CHALLANS.filter(c => myVehicles.includes(c.vehicle) && !paidIds.includes(c.id));
  const due = dueList.reduce((a, c) => a + c.amount, 0);
  const tileW = Math.floor((width - 28 - 24 - 30) / 4);
  const first = s.client.name.split(' ')[0] || '';

  const tile = (k: string, label: string, onPress: () => void, badge?: string) => (
    <Tap key={k} onPress={onPress} style={{ width: tileW, alignItems: 'center', gap: 5 }} accessibilityRole="button" accessibilityLabel={tr(label)}>
      <View>
        <CategoryArt k={k} size={tileW} />
        {badge ? (
          <View style={{ position: 'absolute', right: 4, top: 4, backgroundColor: colors.ink, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 }}>
            <T w="bold" size={9} color={colors.gold}>
              {badge}
            </T>
          </View>
        ) : null}
      </View>
      <T w="semibold" size={11.5} center lh={14} numberOfLines={tr(label).includes(' ') ? 2 : 1}>
        {label}
      </T>
    </Tap>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap onPress={() => navigation.navigate('Profile')}>
            <Avatar source={IMG.ananya} size={36} />
          </Tap>
          <View style={{ flex: 1 }}>
            <T w="bold" size={15} numberOfLines={1} raw>
              {tr('Namaste') + (first ? ', ' + first : '')}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MapPin size={12} color={colors.goldText} />
              <T size={11.5} w="semibold" color={colors.muted} raw numberOfLines={1}>
                {s.client.city + ', ' + s.client.state}
              </T>
            </View>
          </View>
          <Tap
            onPress={() => navigation.navigate('Wallet')}
            accessibilityLabel={tr('Wallet balance')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.goldTint }}>
            <WalletIcon size={15} color={colors.goldText} />
            <T w="bold" size={12.5} color={colors.goldText} raw>
              {inr(s.client.wallet)}
            </T>
          </Tap>
          <IconBtn icon={Bell} label="Notifications" bordered badge={unread} onPress={() => navigation.navigate('Notifications')} />
        </View>
        <Tap
          onPress={() => navigation.navigate('Categories')}
          style={{ height: 42, borderRadius: 12, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Search size={17} color={colors.muted} />
          <T size={13.5} color={colors.muted} style={{ flex: 1 }}>
            Search lawyers and legal services
          </T>
        </Tap>
      </View>

      <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 20, gap: 16 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 8 }}>
          <ScrollView
            ref={scroller}
            horizontal
            snapToInterval={bannerW + 10}
            decelerationRate="fast"
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}
            onMomentumScrollEnd={e => setSlide(Math.round(e.nativeEvent.contentOffset.x / (bannerW + 10)))}>
            {BANNERS.map(b => (
              <Tap
                key={b.key}
                onPress={() => navigation.navigate(b.go === 'offers' ? 'Offers' : b.go === 'challan' ? 'Challan' : 'Categories')}
                style={{ width: bannerW, height: 132, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.ink }}>
                <View style={{ position: 'absolute', right: 6, top: 0 }}>
                  <GlowArt keys={b.art} width={bannerW * 0.42} height={132} />
                </View>
                <View style={{ padding: 14, gap: 5, width: bannerW * 0.64, flex: 1, justifyContent: 'center' }}>
                  <View style={{ alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                    <T w="bold" size={10} color={colors.ink}>
                      {b.tag}
                    </T>
                  </View>
                  <T w="serif" size={17} color={colors.white} lh={22} numberOfLines={2}>
                    {b.title}
                  </T>
                  <T size={11.5} w="medium" color={colors.onInkSoft} numberOfLines={1}>
                    {b.sub}
                  </T>
                </View>
              </Tap>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            {BANNERS.map((b, i) => (
              <View key={b.key} style={{ height: 5, width: i === slide ? 16 : 5, borderRadius: 3, backgroundColor: i === slide ? colors.ink : colors.lineStrong }} />
            ))}
          </View>
        </View>

        <View style={{ marginHorizontal: 14, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 12 }}>
          <SectionHeader title="Legal services" action="See all" onAction={() => navigation.navigate('Categories')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 12 }}>
            {CATEGORIES.map(c => tile(c.key, c.short, () => navigation.navigate('RequestNew', { category: c.key })))}
            {tile('challan', 'e-Challan', () => navigation.navigate('Challan'), 'PAY')}
          </View>
        </View>

        {dueList.length ? (
          <Tap
            onPress={() => navigation.navigate('Challan')}
            style={{ marginHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FDF3EA', borderWidth: 1, borderColor: '#F3D9C2', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 12 }}>
            <CategoryArt k="challan" size={34} radius={9} plain />
            <View style={{ flex: 1 }}>
              <T w="bold" size={13} color={colors.orangeText} raw>
                {tr('{n} challans due', { n: dueList.length }) + ' · ' + inr(due)}
              </T>
              <T size={11.5} color={colors.orangeText} raw numberOfLines={1}>
                {myVehicles.join(', ')}
              </T>
            </View>
            <T w="bold" size={12.5} color={colors.orange}>
              Pay now
            </T>
            <ChevronRight size={16} color={colors.orange} />
          </Tap>
        ) : null}

        {active.length ? (
          <View style={{ marginHorizontal: 14, gap: 8 }}>
            <SectionHeader title={tr('Your requests') + ' · ' + active.length} action="View all" onAction={() => navigation.navigate('Requests')} />
            {active.slice(0, 2).map(r => (
              <ActiveRequestCard key={r.id} r={r} onPress={() => navigation.navigate('RequestDetail', { id: r.id })} />
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 14 }}>
          <QuickCard icon={Receipt} title="GST filing" sub="Returns by our team" onPress={() => navigation.navigate('GstFiling')} />
          <QuickCard icon={Gift} title="Refer & earn" sub="Friends get help, you earn" onPress={() => navigation.navigate('Refer')} />
          <QuickCard icon={Tag} title="Offers" sub={tr('{n} live offers', { n: OFFERS.length })} onPress={() => navigation.navigate('Offers')} />
        </View>

        <View style={{ marginHorizontal: 14, flexDirection: 'row', backgroundColor: colors.ink, borderRadius: 14, paddingVertical: 12 }}>
          {[
            { icon: ShieldCheck, t: 'Verified advocates', s: 'Bar Council checked' },
            { icon: Lock, t: 'Private chat', s: 'Number never shared' },
            { icon: WalletIcon, t: 'Safe payment', s: 'Released on completion' },
          ].map((x, i) => (
            <View key={x.t} style={{ flex: 1, alignItems: 'center', gap: 4, paddingHorizontal: 4, borderLeftWidth: i ? 1 : 0, borderLeftColor: colors.inkLine }}>
              <x.icon size={19} color={colors.gold} />
              <T w="bold" size={11.5} color={colors.white} center>
                {x.t}
              </T>
              <T size={10} color={colors.onInkMuted} center>
                {x.s}
              </T>
            </View>
          ))}
        </View>

        <View style={{ gap: 8 }}>
          <View style={{ paddingHorizontal: 14 }}>
            <SectionHeader title="Offers for you" action="See all" onAction={() => navigation.navigate('Offers')} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 14, gap: 10 }}>
            {OFFERS.map((o, i) => (
              <Tap
                key={o.code}
                onPress={() => navigation.navigate('Offers')}
                style={{ width: 210, borderRadius: 12, borderWidth: 1, borderStyle: 'dashed', borderColor: i === 0 ? colors.gold : colors.lineStrong, backgroundColor: i === 0 ? colors.goldWash : colors.white, paddingVertical: 10, paddingHorizontal: 12, gap: 3 }}>
                <T w="extrabold" size={17} color={colors.ink}>
                  {i === 0 ? '10% off' : '₹100 cashback'}
                </T>
                <T size={11.5} w="medium" color={colors.text2} numberOfLines={1}>
                  {o.sub}
                </T>
                <T size={11.5} w="bold" color={i === 0 ? colors.goldText : colors.muted} raw>
                  {i === 0 ? o.code + ' · ' + tr(o.till) : tr(o.till)}
                </T>
              </Tap>
            ))}
          </ScrollView>
        </View>

        <Tap
          onPress={() => openWhatsApp('General help')}
          style={{ marginHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={18} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={13.5}>
              Need help choosing?
            </T>
            <T size={11.5} color={colors.muted}>
              Chat with our team on WhatsApp
            </T>
          </View>
          <ChevronRight size={18} color={colors.muted} />
        </Tap>
      </ScrollView>
    </View>
  );
}

function QuickCard({ icon: Icon, title, sub, onPress }: { icon: any; title: string; sub: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={{ flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 10, gap: 6 }}>
      <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={colors.goldText} />
      </View>
      <T w="bold" size={12.5} numberOfLines={1}>
        {title}
      </T>
      <T size={10.5} color={colors.muted} numberOfLines={2} lh={13}>
        {sub}
      </T>
    </Tap>
  );
}

function ActiveRequestCard({ r, onPress }: { r: ClientRequest; onPress: () => void }) {
  const adv = advocateById(r.advocateId);
  const st = REQ_STATUS[r.status];
  const cat = categoryOf(r.category);
  const cta = r.status === 'quoted' ? 'Pay' : r.status === 'done' ? 'Confirm' : null;
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
      {adv ? <Avatar source={adv.photo} size={40} /> : <CategoryArt k={r.category} size={40} radius={10} />}
      <View style={{ flex: 1, gap: 3 }}>
        <T w="bold" size={13.5} raw numberOfLines={1}>
          {adv ? adv.name : tr(cat.name)}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Pill label={st.label} tone={st.tone} />
          <T size={11} color={colors.muted} raw>
            {r.id}
          </T>
        </View>
      </View>
      {cta ? (
        <View style={{ backgroundColor: colors.gold, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 7 }}>
          <T w="bold" size={12.5} color={colors.ink}>
            {cta}
          </T>
        </View>
      ) : (
        <ChevronRight size={18} color={colors.muted} />
      )}
    </Card>
  );
}

/* ---------- categories ---------- */

export function Categories({ navigation }: P) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Legal services" onBack={() => navigation.goBack()} />
      <Body gap={12}>
        {CATEGORIES.map(c => (
          <Card key={c.key} onPress={() => navigation.navigate('RequestNew', { category: c.key })} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 10 }}>
            <CategoryArt k={c.key} size={64} radius={12} />
            <View style={{ flex: 1, gap: 4 }}>
              <T w="bold" size={15}>
                {c.name}
              </T>
              <T size={12.5} color={colors.muted} lh={18}>
                {c.covers}
              </T>
            </View>
            <ChevronRight size={18} color={colors.muted} />
          </Card>
        ))}
      </Body>
    </View>
  );
}

/* ---------- new request ---------- */

const REQ_LANGS = ['हिन्दी', 'English', 'मराठी', 'ગુજરાતી', 'বাংলা', 'ਪੰਜਾਬੀ', 'தமிழ்', 'తెలుగు', 'ಕನ್ನಡ'];

export function RequestNew({ navigation, route }: P) {
  const { s, submitRequest } = useApp();
  const [cat, setCat] = useState<CategoryKey>(route.params?.category ?? 'other');
  const [issue, setIssue] = useState('');
  const [district, setDistrict] = useState(s.client.city);
  const [lang, setLang] = useState(s.lang === 'en' ? 'English' : REQ_LANGS[LANGS.findIndex(l => l.code === s.lang) - 1] ?? 'हिन्दी');
  const [docs, setDocs] = useState<string[]>([]);
  const [pickCat, setPickCat] = useState(false);
  const c = categoryOf(cat);
  const tone = categoryTone[cat];
  const ok = issue.trim().length >= 15;

  const addDoc = () =>
    Alert.alert(tr('Add a document'), tr('Photograph a paper or pick an image'), [
      { text: tr('Camera'), onPress: async () => { const u = await takePhoto(); if (u) setDocs(d => [...d, u]); } },
      { text: tr('Gallery'), onPress: async () => { const u = await choosePhoto(); if (u) setDocs(d => [...d, u]); } },
      { text: tr('Cancel'), style: 'cancel' },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Request an advocate" onBack={() => navigation.goBack()} />
      <Body gap={18}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: tone.bg, borderRadius: 14, padding: 12 }}>
          <CategoryArt k={c.key} size={52} radius={12} plain />
          <View style={{ flex: 1 }}>
            <T w="bold" size={16} color={tone.fg}>
              {c.name}
            </T>
            <T size={12} w="medium" color={tone.fg} lh={17}>
              {c.covers}
            </T>
          </View>
          <Tap onPress={() => setPickCat(!pickCat)} hitSlop={10}>
            <T w="semibold" size={13} color={tone.fg}>
              {pickCat ? 'Done' : 'Change'}
            </T>
          </Tap>
        </View>
        {pickCat ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {CATEGORIES.map(k => (
              <Chip key={k.key} label={k.short} active={k.key === cat} onPress={() => { setCat(k.key); setPickCat(false); }} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: 4 }}>
          <Field
            label="Tell us what happened"
            value={issue}
            onChangeText={setIssue}
            multiline
            maxLength={1000}
            placeholder="Describe your problem in your own words. Mention dates, places and what you want to achieve."
          />
          <T size={12} w="medium" color={colors.muted} style={{ textAlign: 'right' }} raw>
            {issue.length + ' / 1000'}
          </T>
        </View>

        <DistrictPicker value={district} onChange={setDistrict} label="District" />

        <View style={{ gap: 8 }}>
          <T w="semibold" size={13} color={colors.text2}>
            Preferred language
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {REQ_LANGS.slice(0, 5).map(l => (
              <Chip key={l} label={l} raw active={lang === l} onPress={() => setLang(l)} />
            ))}
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <T w="semibold" size={13} color={colors.text2}>
            Documents (optional)
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {docs.map((u, i) => (
              <View key={u}>
                <Image source={{ uri: u }} style={{ width: 76, height: 76, borderRadius: 12, backgroundColor: colors.surface2 }} />
                <Tap
                  accessibilityLabel={tr('Remove')}
                  onPress={() => setDocs(d => d.filter((_, k) => k !== i))}
                  style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                  <X size={14} color={colors.white} />
                </Tap>
              </View>
            ))}
            <Tap
              accessibilityLabel={tr('Add document')}
              onPress={addDoc}
              style={{ width: 76, height: 76, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B8B0A0', alignItems: 'center', justifyContent: 'center' }}>
              <Plus size={22} color={colors.muted} />
            </Tap>
          </View>
        </View>

        <Card style={{ gap: 12 }}>
          <T w="bold" size={14}>
            What happens next
          </T>
          {[
            'Our team reviews your request and assigns a verified advocate in your district.',
            'The advocate chats with you here and sends a fee quote. Your number stays private.',
            'You pay in the app. We release it to the advocate only after you confirm the work is done.',
          ].map((t, i) => (
            <View key={t} style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <T w="bold" size={12} color={colors.gold} raw>
                  {String(i + 1)}
                </T>
              </View>
              <T size={13} color={colors.text2} lh={19} style={{ flex: 1 }}>
                {t}
              </T>
            </View>
          ))}
        </Card>
      </Body>
      <BottomBar>
        <Button
          title="Submit request"
          disabled={!ok}
          onPress={() => {
            const id = submitRequest({ category: cat, issue: issue.trim(), district, lang, docs });
            navigation.replace('RequestSubmitted', { id });
          }}
        />
        {!ok ? (
          <T size={12} color={colors.muted} center>
            Write at least a sentence about your problem
          </T>
        ) : null}
      </BottomBar>
    </View>
  );
}

export function RequestSubmitted({ navigation, route }: P) {
  const id = route.params?.id;
  useBarStyle(true);
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, padding: 24, justifyContent: 'center', gap: 18 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.gold, alignItems: 'center', justifyContent: 'center' }}>
        <FileText size={34} color={colors.ink} />
      </View>
      <T w="serif" size={28} color={colors.white}>
        Request submitted
      </T>
      <T size={15} color={colors.onInkSoft} lh={23} raw>
        {tr('Request {id} is with our team. We will assign a verified advocate and notify you. You can chat with them in the app.', { id })}
      </T>
      <Note tone="gold">Demo build: an advocate is assigned in a few seconds and sends a quote shortly after.</Note>
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title="Track my request" onPress={() => navigation.replace('RequestDetail', { id })} />
        <Button title="Back to home" variant="line" onPress={() => navigation.popTo('ClientTabs', { screen: 'Home' })} />
      </View>
    </View>
  );
}

/* ---------- requests ---------- */

export function Requests({ navigation }: P) {
  const { s } = useApp();
  useLang();
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const list = s.requests.filter(r => (tab === 'active' ? r.status !== 'completed' : r.status === 'completed'));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="My requests" right={<IconBtn icon={Plus} label="New request" onPress={() => navigation.navigate('Categories')} />} />
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {(['active', 'done'] as const).map(k => (
          <Tap key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
            <T w="semibold" size={14} color={tab === k ? colors.ink : colors.muted}>
              {k === 'active' ? 'Active' : 'Completed'}
            </T>
          </Tap>
        ))}
      </View>
      <Body gap={10}>
        {list.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={tab === 'active' ? 'No active requests' : 'Nothing completed yet'}
            sub="Pick a legal service and describe your problem. A verified advocate will contact you here."
            action="Request an advocate"
            onAction={() => navigation.navigate('Categories')}
          />
        ) : (
          list.map(r => {
            const c = categoryOf(r.category);
            const adv = advocateById(r.advocateId);
            const st = REQ_STATUS[r.status];
            return (
              <Card key={r.id} onPress={() => navigation.navigate('RequestDetail', { id: r.id })} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <CategoryArt k={r.category} size={46} radius={10} />
                  <View style={{ flex: 1 }}>
                    <T w="bold" size={14.5}>
                      {c.name}
                    </T>
                    <T size={12} w="medium" color={colors.muted} raw>
                      {r.id + ' · ' + ago(r.createdAt)}
                    </T>
                  </View>
                  <Pill label={st.label} tone={st.tone} />
                </View>
                <T size={13} color={colors.text2} numberOfLines={2} raw>
                  {r.issue}
                </T>
                {adv ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Avatar source={adv.photo} size={24} />
                    <T size={12.5} w="semibold" color={colors.text2} raw>
                      {adv.name}
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

export function RequestDetail({ navigation, route }: P) {
  const { s } = useApp();
  useLang();
  const r = s.requests.find(x => x.id === route.params?.id);
  if (!r) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const c = categoryOf(r.category);
  const adv = advocateById(r.advocateId);
  const st = REQ_STATUS[r.status];
  const order = ['submitted', 'assigned', 'quoted', 'paid', 'done', 'completed'];
  const at = r.status === 'disputed' ? 4 : order.indexOf(r.status);
  const step = (i: number) => (i < at || r.status === 'completed' ? 'done' : i === at ? 'now' : 'todo') as 'done' | 'now' | 'todo';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={c.name} sub={r.id} onBack={() => navigation.goBack()} right={<Pill label={st.label} tone={st.tone} />} />
      <Body>
        {adv ? (
          <Card onPress={() => navigation.navigate('AdvocateProfile', { id: adv.id })}>
            <AdvocateRow a={adv} right={<ChevronRight size={18} color={colors.muted} />} />
          </Card>
        ) : (
          <Note tone="neutral" icon={ShieldCheck}>
            Our team is choosing a verified advocate for you. You will get a notification.
          </Note>
        )}

        {r.status === 'quoted' && r.quote ? (
          <Card style={{ borderColor: colors.ink, borderWidth: 1.5, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w="bold" size={13} color={colors.goldText}>
                Fee quote
              </T>
              <T size={12} color={colors.muted} raw>
                {tr('Valid till {d}', { d: dateShort(r.quote.validTill) })}
              </T>
            </View>
            <T w="extrabold" size={26} raw>
              {inr(r.quote.fee)}
            </T>
            <T size={13} color={colors.text2} lh={19} raw>
              {r.quote.scope}
            </T>
            <Button title="Accept and pay" onPress={() => navigation.navigate('Checkout', { id: r.id })} />
          </Card>
        ) : null}

        {r.status === 'done' ? (
          <Card style={{ gap: 10, borderColor: colors.orange }}>
            <T w="bold" size={15}>
              Is the work done?
            </T>
            <T size={13} color={colors.text2} lh={19} raw>
              {tr('Confirm to release the payment to your advocate. If you do nothing, it confirms automatically in {d} days.', { d: AUTO_CONFIRM_DAYS })}
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Confirm" style={{ flex: 1 }} onPress={() => navigation.navigate('Confirm', { id: r.id })} />
              <Button title="Raise a dispute" variant="danger" onPress={() => navigation.navigate('Dispute', { id: r.id })} />
            </View>
          </Card>
        ) : null}

        <Card>
          <Timeline
            steps={[
              { title: 'Request submitted', sub: dateShort(r.createdAt), state: step(0) },
              { title: 'Advocate assigned', sub: adv?.name, state: step(1) },
              { title: 'Fee quote', sub: r.quote ? inr(r.quote.fee) : undefined, state: step(2) },
              { title: 'Paid', sub: r.paid ? inr(r.paid.total) + ' · ' + tr('held safely') : undefined, state: step(3) },
              { title: r.status === 'disputed' ? 'Disputed' : 'Work done', sub: r.status === 'disputed' ? tr('Our team is reviewing') : undefined, state: step(4) },
              { title: 'Confirmed', state: step(5) },
            ]}
          />
        </Card>

        <Card style={{ gap: 8 }}>
          <T w="bold" size={14}>
            Your request
          </T>
          <T size={13.5} color={colors.text2} lh={20} raw>
            {r.issue}
          </T>
          <T size={12} color={colors.muted} raw>
            {r.district + ' · ' + r.lang + (r.docs.length ? ' · ' + r.docs.length + ' ' + tr('documents') : '')}
          </T>
        </Card>

        {r.paid ? (
          <Card style={{ gap: 8 }}>
            <T w="bold" size={14}>
              Payment
            </T>
            <BillRow label="Advocate's fee" value={inr(r.paid.fee)} />
            {r.paid.discount ? <BillRow label={tr('Offer') + ' ' + (r.paid.offer ?? '')} value={'−' + inr(r.paid.discount)} color={colors.green} raw /> : null}
            <BillRow label="GST" value={inr(r.paid.gst)} />
            {r.paid.wallet ? <BillRow label="Wallet" value={'−' + inr(r.paid.wallet)} color={colors.green} /> : null}
            <Divider />
            <BillRow label="Paid" value={inr(r.paid.total)} strong />
          </Card>
        ) : null}

        {r.rating ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <T w="semibold" size={14}>
              Your rating
            </T>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[1, 2, 3, 4, 5].map(k => (
                <Star key={k} size={16} color={colors.gold} fill={k <= (r.rating ?? 0) ? colors.gold : 'transparent'} />
              ))}
            </View>
          </Card>
        ) : null}
      </Body>
      {adv ? (
        <BottomBar>
          <Button title="Open chat" variant="ink" icon={MessageCircle} onPress={() => navigation.navigate('Chat', { chatId: r.id })} />
        </BottomBar>
      ) : null}
    </View>
  );
}

/* ---------- checkout ---------- */

export function Checkout({ navigation, route }: P) {
  const { s, payRequest } = useApp();
  useLang();
  const r = s.requests.find(x => x.id === route.params?.id);
  const offerOk = !s.client.usedFirst10;
  const [useOffer, setUseOffer] = useState(offerOk);
  const [useWallet, setUseWallet] = useState(s.client.wallet > 0);
  const [paying, setPaying] = useState(false);
  if (!r || !r.quote) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;
  const c = categoryOf(r.category);
  const adv = advocateById(r.advocateId);
  const discount = useOffer && offerOk ? offerDiscount(r.quote.fee, { percent: 10, max: 500 }) : 0;
  const bill = clientBill(r.quote.fee, { discount, gstOnService: c.gstOnService, wallet: useWallet ? s.client.wallet : 0 });
  const pay = () => {
    setPaying(true);
    setTimeout(() => {
      payRequest(r.id, { useOffer: useOffer && offerOk, useWallet });
      navigation.replace('PaymentDone', { id: r.id, total: bill.total });
    }, 1400);
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Checkout" onBack={() => navigation.goBack()} />
      <Body gap={14}>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {adv ? <Image source={adv.photo} style={{ width: 48, height: 48, borderRadius: 12 }} /> : null}
          <View style={{ flex: 1 }}>
            <T w="bold" size={14}>
              {c.name}
            </T>
            <T size={12} w="medium" color={colors.muted} raw>
              {(adv?.name ?? '') + ' · ' + tr('Request') + ' ' + r.id}
            </T>
          </View>
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' }}>
            <Tag size={20} color={colors.goldText} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={14} raw>
              FIRST10
            </T>
            <T size={12} w="medium" color={offerOk ? (useOffer ? colors.green : colors.muted) : colors.muted}>
              {!offerOk ? 'Already used on your first consultation' : useOffer ? 'Applied · 10% off, up to ₹500' : 'Tap to apply · 10% off up to ₹500'}
            </T>
          </View>
          {offerOk ? <Toggle value={useOffer} onChange={setUseOffer} label="Apply offer" /> : null}
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
            <WalletIcon size={20} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={14}>
              Use wallet balance
            </T>
            <T size={12} w="medium" color={colors.muted} raw>
              {inr(s.client.wallet) + ' ' + tr('available')}
            </T>
          </View>
          <Toggle value={useWallet && s.client.wallet > 0} onChange={v => s.client.wallet > 0 && setUseWallet(v)} label="Use wallet" />
        </Card>
        <Card style={{ gap: 10 }}>
          <T w="bold" size={15}>
            Bill details
          </T>
          <BillRow label="Advocate's fee" value={inr(bill.fee)} />
          {bill.discount ? <BillRow label="Offer FIRST10 (10%)" value={'−' + inr(bill.discount)} color={colors.green} /> : null}
          <BillRow label={c.gstOnService ? tr('GST 18% on {x}', { x: inr(bill.base) }) : tr('GST (not charged on this service)')} value={inr(bill.gst)} raw />
          {bill.wallet ? <BillRow label="Wallet" value={'−' + inr(bill.wallet)} color={colors.green} /> : null}
          <Divider />
          <BillRow label="To pay" value={inr(bill.total)} strong />
        </Card>
        <Note icon={ShieldCheck}>Vakeel Bhai holds this payment. It goes to your advocate only after you confirm the work is done. GST invoice sent by email.</Note>
        <Note tone="gold">Demo build: no real payment is taken. Razorpay (UPI, cards, netbanking) is connected in the backend phase.</Note>
      </Body>
      <BottomBar row>
        <View>
          <T w="extrabold" size={19} raw>
            {inr(bill.total)}
          </T>
          <T size={11.5} w="medium" color={colors.muted}>
            UPI, cards, netbanking
          </T>
        </View>
        <Button title={paying ? 'Processing…' : 'Pay securely'} loading={paying} onPress={pay} style={{ flex: 1 }} />
      </BottomBar>
    </View>
  );
}

export function PaymentDone({ navigation, route }: P) {
  const { id, total } = route.params ?? {};
  useBarStyle(true);
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, padding: 24, justifyContent: 'center', gap: 18 }}>
      <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center' }}>
        <ShieldCheck size={36} color={colors.white} />
      </View>
      <T w="serif" size={28} color={colors.white}>
        Payment successful
      </T>
      <T w="extrabold" size={32} color={colors.gold} raw>
        {inr(total ?? 0)}
      </T>
      <T size={15} color={colors.onInkSoft} lh={23}>
        Your money is held safely. Your advocate starts the work now, and it is released only when you confirm.
      </T>
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title="Back to my request" onPress={() => navigation.replace('RequestDetail', { id })} />
        <Button title="Go home" variant="line" onPress={() => navigation.popTo('ClientTabs', { screen: 'Home' })} />
      </View>
    </View>
  );
}

/* ---------- confirm & dispute ---------- */

export function Confirm({ navigation, route }: P) {
  const { s, confirmRequest } = useApp();
  const r = s.requests.find(x => x.id === route.params?.id);
  const adv = advocateById(r?.advocateId);
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');
  if (!r || !adv) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Confirm and rate" onBack={() => navigation.goBack()} />
      <Body>
        <Card>
          <AdvocateRow a={adv} />
        </Card>
        <T w="bold" size={17} center>
          How was your experience?
        </T>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          {[1, 2, 3, 4, 5].map(k => (
            <Tap key={k} onPress={() => setStars(k)} accessibilityLabel={k + ' ' + tr('stars')} hitSlop={6}>
              <Star size={38} color={colors.gold} fill={k <= stars ? colors.gold : 'transparent'} />
            </Tap>
          ))}
        </View>
        <Field label="Review (optional)" value={review} onChangeText={setReview} multiline placeholder="What went well? Your review helps other clients." />
        <Note icon={ShieldCheck}>Confirming releases the payment to the advocate. Do this only when the work you agreed on is done.</Note>
      </Body>
      <BottomBar>
        <Button
          title="Confirm work is done"
          onPress={() => {
            confirmRequest(r.id, stars, review);
            navigation.goBack();
          }}
        />
      </BottomBar>
    </View>
  );
}

const DISPUTE_REASONS = ['Work not done as agreed', 'Advocate stopped responding', 'Charged more than the quote', 'Other'];

export function Dispute({ navigation, route }: P) {
  const { disputeRequest } = useApp();
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [detail, setDetail] = useState('');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Raise a dispute" onBack={() => navigation.goBack()} />
      <Body>
        <Note tone="orange">The payment stays on hold while our team reviews. We reply in your request chat within 24 hours.</Note>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {DISPUTE_REASONS.map(x => (
            <Chip key={x} label={x} active={reason === x} onPress={() => setReason(x)} />
          ))}
        </View>
        <Field label="Tell us more" value={detail} onChangeText={setDetail} multiline placeholder="What happened?" />
      </Body>
      <BottomBar>
        <Button
          title="Submit dispute"
          variant="ink"
          disabled={detail.trim().length < 10}
          onPress={() => {
            disputeRequest(route.params.id, tr(reason) + ': ' + detail.trim());
            navigation.goBack();
          }}
        />
      </BottomBar>
    </View>
  );
}

export function AdvocateProfile({ navigation, route }: P) {
  const a = advocateById(route.params?.id);
  if (!a) return null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Advocate profile" onBack={() => navigation.goBack()} />
      <Body>
        <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
          <Image source={a.photo} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.gold }} />
          <T w="serif" size={20} raw>
            {a.name}
          </T>
          <Pill label="Verified advocate" tone="ink" dot={false} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Star size={14} color={colors.gold} fill={colors.gold} />
            <T w="semibold" size={13} raw>
              {a.rating + ' · ' + a.reviews + ' ' + tr('reviews')}
            </T>
          </View>
        </Card>
        <Card style={{ gap: 12 }}>
          <BillRow label="Practice" value={a.practice.map(p => tr(categoryOf(p).short)).join(', ')} />
          <BillRow label="Experience" value={a.years + ' ' + tr('years')} />
          <BillRow label="Court" value={a.court} />
          <BillRow label="Languages" value={a.languages} />
          <BillRow label="Enrolment no." value={a.enrolment} />
        </Card>
        <Note icon={ShieldCheck}>Bar Council documents checked by the Vakeel Bhai team. Phone numbers are never shared. Talk in the private chat.</Note>
      </Body>
    </View>
  );
}

/* ---------- offers, wallet, refer ---------- */

export function Offers({ navigation }: P) {
  const { s } = useApp();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Offers" onBack={() => navigation.goBack()} />
      <Body>
        {OFFERS.map((o, i) => (
          <Card key={o.code} style={{ padding: 0, overflow: 'hidden' }}>
            <View style={{ height: 110, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
              <GlowArt keys={o.art} width={220} height={110} />
            </View>
            <View style={{ padding: 14, gap: 6 }}>
              <T w="bold" size={16}>
                {o.title}
              </T>
              <T size={13} color={colors.muted}>
                {o.sub}
              </T>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.goldWash }}>
                  <T w="extrabold" size={13} color={colors.goldText} raw>
                    {o.code}
                  </T>
                </View>
                <T size={12} w="semibold" color={i === 0 && s.client.usedFirst10 ? colors.muted : colors.green}>
                  {i === 0 && s.client.usedFirst10 ? 'Used' : o.till}
                </T>
              </View>
            </View>
          </Card>
        ))}
        <T size={12} color={colors.muted} center>
          Discounts apply to the advocate's fee. GST is calculated after the discount.
        </T>
      </Body>
    </View>
  );
}

export function ClientWallet({ navigation }: P) {
  const { s } = useApp();
  useLang();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Wallet" />
      <Body>
        <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 18, gap: 12 }}>
          <T size={12} w="medium" color={colors.onInkMuted}>
            Wallet balance
          </T>
          <T w="extrabold" size={32} color={colors.white} raw>
            {inr(s.client.wallet)}
          </T>
          <T size={12.5} color={colors.onInkSoft} lh={18}>
            Use it at checkout. Referral rewards and cashback land here. Wallet money cannot be withdrawn.
          </T>
          <Button title="Refer and earn" icon={Gift} small onPress={() => navigation.navigate('Refer')} style={{ alignSelf: 'flex-start' }} />
        </View>
        <SectionHeader title="History" />
        {s.client.walletTx.length === 0 ? (
          <EmptyState title="No transactions yet" />
        ) : (
          s.client.walletTx.map(t => (
            <Card key={t.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: t.amount >= 0 ? colors.greenSoft : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {t.amount >= 0 ? <Gift size={19} color={colors.green} /> : <Receipt size={19} color={colors.text2} />}
              </View>
              <View style={{ flex: 1 }}>
                <T w="bold" size={14}>
                  {t.title}
                </T>
                <T size={12} color={colors.muted} raw>
                  {tr(t.sub) + ' · ' + dateShort(t.at)}
                </T>
              </View>
              <T w="extrabold" size={15} color={t.amount >= 0 ? colors.green : colors.text} raw>
                {(t.amount >= 0 ? '+' : '') + inr(t.amount)}
              </T>
            </Card>
          ))
        )}
      </Body>
    </View>
  );
}

export function Refer({ navigation }: P) {
  const { s } = useApp();
  useLang();
  const code = s.client.referralCode || 'VBUSER123';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Refer and earn" onBack={() => navigation.goBack()} />
      <Body>
        <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 20, gap: 14, alignItems: 'center' }}>
          <Gift size={40} color={colors.gold} />
          <T w="serif" size={22} color={colors.white} center>
            Earn wallet cash for every friend
          </T>
          <T size={13.5} color={colors.onInkSoft} center lh={20}>
            When a friend joins with your code and completes their first paid service, you get a reward in your wallet. The amount is set by Vakeel Bhai.
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}>
            <T w="extrabold" size={20} color={colors.gold} raw style={{ letterSpacing: 1 }}>
              {code}
            </T>
            <Copy size={18} color={colors.gold} />
          </View>
        </View>
        <Button
          title="Share my code"
          icon={Share2}
          onPress={() => Share.share({ message: tr('Get legal help from verified advocates on Vakeel Bhai. Use my code {code} when you sign up.', { code }) }).catch(() => {})}
        />
        <Card style={{ gap: 12 }}>
          <T w="bold" size={14}>
            How it works
          </T>
          {['Share your code with a friend', 'They sign up and enter your code', 'You earn when their first paid service is confirmed'].map((t, i) => (
            <View key={t} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <T w="bold" size={12} color={colors.gold} raw>
                  {String(i + 1)}
                </T>
              </View>
              <T size={13} color={colors.text2} style={{ flex: 1 }}>
                {t}
              </T>
            </View>
          ))}
        </Card>
        <Card style={{ gap: 8 }}>
          <T w="bold" size={14}>
            Your referrals
          </T>
          <BillRow label="Rahul M. · first service done" value="+₹150" color={colors.green} />
          <T size={12} color={colors.muted}>
            Rewards may include GST where applicable.
          </T>
        </Card>
      </Body>
    </View>
  );
}

/* ---------- profile ---------- */

export function ClientProfile({ navigation }: P) {
  const { s, logout } = useApp();
  useLang();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Profile" />
      <Body>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Avatar source={IMG.ananya} size={56} />
          <View style={{ flex: 1 }}>
            <T w="bold" size={17} raw>
              {s.client.name}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {'+91 ' + phonePretty(s.phone)}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {s.client.email || tr('Add email for invoices')}
            </T>
          </View>
          <IconBtn icon={Pencil} label="Edit profile" onPress={() => navigation.navigate('EditClient')} />
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={FileText} title="My requests" onPress={() => navigation.navigate('Requests')} />
          <Divider />
          <ListRow icon={Receipt} title="e-Challan" sub="Vehicles and receipts" onPress={() => navigation.navigate('Challan')} />
          <Divider />
          <ListRow icon={Receipt} title="GST filing" onPress={() => navigation.navigate('GstFiling')} />
          <Divider />
          <ListRow icon={Gift} title="Refer and earn" onPress={() => navigation.navigate('Refer')} />
          <Divider />
          <ListRow icon={Tag} title="Offers" onPress={() => navigation.navigate('Offers')} />
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

