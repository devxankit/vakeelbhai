import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, Linking, ScrollView, Share, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Bell,
  Car,
  ChevronRight,
  CircleHelp,
  Compass,
  FileText,
  Gift,
  Globe,
  Headset,
  Lock,
  LogOut,
  MapPin,
  MessageCircle,
  Pencil,
  Plus,
  Receipt,
  Search,
  Settings as SettingsIcon,
  Share2,
  ShieldCheck,
  Star,
  Tag,
  UserRound,
  Wallet as WalletIcon,
  X,
} from 'lucide-react-native';
import T from '../components/T';
import { AppBar, BillRow, Body, BottomBar, Button, Card, Chip, Divider, EmptyState, Field, IconBtn, InkHeader, ListRow, Note, Pill, SectionHeader, Select, Tap, Timeline, Toggle, useBarStyle } from '../components/ui';
import { AdvocateCard, AdvocateRow, REQ_STATUS } from '../components/brand';
import { CategoryArt, GlowArt } from '../components/art';
import { LoadError, Loading, SecureImage, usePay } from '../components/data';
import { colors, categoryTone } from '../theme';
import { BANNERS, CATEGORIES, categoryOf, CategoryKey, DISTRICTS, STATES } from '../data/catalog';
import { ReqStatus, useApp, useClientMe } from '../store/AppStore';
import { api, apiUrl, errText, photoForm } from '../api/client';

/** Open a payment's GST invoice PDF in the phone's browser (a link valid for 10 minutes). */
export async function openInvoice(paymentId: string) {
  try {
    const j = await api('/payments/' + paymentId + '/invoice-link');
    await Linking.openURL(apiUrl() + j.data.path);
  } catch (e) {
    Alert.alert(tr('Invoice'), errText(e));
  }
}

type HomeBanner = { key: string; title: string; sub: string; tag: string; image: string | null; art: string[]; go: () => void };
import { useApi } from '../api/hooks';
import { useLive } from '../api/live';
import { inr } from '../utils/money';
import { ago, dateShort, phonePretty } from '../utils/format';
import { choosePhoto, takePhoto } from '../utils/media';
import { resetTo } from './auth';
import { LANGS, tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

/** A request as the API sends it to its client (server clientView). */
export type ClientRequest = {
  id: string;
  category: CategoryKey;
  issue: string;
  district: string;
  lang: string;
  docs: { id: string; at: string }[];
  createdAt: string;
  status: ReqStatus;
  advocate: AdvocateCard | null;
  assignedAt: string | null;
  quote: { fee: number; scope: string; validTill: string; at: string } | null;
  paid: { id: string; fee: number; discount: number; base: number; gst: number; wallet: number; total: number; at: string; status: string; refund: string | null } | null;
  doneAt: string | null;
  autoConfirmAt: string | null;
  completedAt: string | null;
  rating: number | null;
  review: string | null;
  dispute: { reason: string; status: string; at: string; note: string | null } | null;
};

const ts = (d?: string | null) => (d ? new Date(d).getTime() : 0);
const advPhoto = (r: { id: string }) => '/client/requests/' + r.id + '/advocate/photo';

/** Initials in a circle (clients have no profile photo). */
export function Initials({ name, size = 40, dark }: { name: string; size?: number; dark?: boolean }) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const text = parts.length ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() : '';
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: dark ? colors.ink : colors.goldTint, alignItems: 'center', justifyContent: 'center' }}>
      {text ? (
        <T w="bold" size={size * 0.38} color={dark ? colors.gold : colors.goldText} raw>
          {text}
        </T>
      ) : (
        <UserRound size={size * 0.5} color={colors.goldText} />
      )}
    </View>
  );
}

/* ---------- profile setup ---------- */

function DistrictPicker({ value, onChange, label = 'City / district' }: { value: string; onChange: (d: string) => void; label?: string }) {
  return <Select label={label} value={value} options={DISTRICTS.includes(value) || !value ? DISTRICTS : [value, ...DISTRICTS]} onChange={onChange} placeholder="Choose your city" />;
}

export function ClientSetup({ navigation, route }: P) {
  const { reloadMe } = useApp();
  const me = useClientMe();
  const editing = route?.params?.edit;
  const [name, setName] = useState(me?.user.name ?? '');
  const [email, setEmail] = useState(me?.user.email ?? '');
  const [city, setCity] = useState(me?.city || 'Indore');
  const [state, setState] = useState(me?.state || 'Madhya Pradesh');
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState('');
  const ok = name.trim().length >= 2 && (!email || /\S+@\S+\.\S+/.test(email));
  const save = async () => {
    setBusy(true);
    try {
      await api('/client/profile', { method: 'PATCH', body: { name: name.trim(), email: email.trim(), city, state } });
      if (!editing && ref.trim()) {
        try {
          await api('/client/referral/apply', { method: 'POST', body: { code: ref.trim().toUpperCase() } });
        } catch (e) {
          Alert.alert(tr('Referral code not applied'), errText(e));
        }
      }
      await reloadMe();
      if (editing) navigation.goBack();
      else resetTo(navigation, { name: 'ClientTabs' });
    } catch (e) {
      Alert.alert(tr('Could not save'), errText(e));
      setBusy(false);
    }
  };
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
        <Select label="State" value={state} options={STATES.includes(state) ? STATES : [state, ...STATES]} onChange={setState} placeholder="Choose your state" />
        {!editing ? <Field label="Referral code (optional)" value={ref} onChangeText={t => setRef(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="e.g. VBRAHUL123" maxLength={20} autoCapitalize="characters" /> : null}
      </Body>
      <BottomBar>
        <Button title={editing ? 'Save' : 'Continue'} disabled={!ok} loading={busy} onPress={save} />
      </BottomBar>
    </View>
  );
}

export const EditClient = (p: P) => <ClientSetup {...p} route={{ params: { edit: true } }} />;

/* ---------- home ---------- */

export function ClientHome({ navigation }: P) {
  const { meta, unread } = useApp();
  const me = useClientMe();
  useBarStyle(false);
  useLang();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const bannerW = width - 28;
  const [slide, setSlide] = useState(0);
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const requests = useApi<ClientRequest[]>('/client/requests?tab=active');
  const wallet = useApi<{ balance: number }>('/client/wallet');
  const live = useApi<{ id: string; title: string; sub: string; tag: string; hasImage: boolean; imageVersion: number; link: { kind: string; value: string } }[]>('/banners?audience=client');
  useLive({ 'request:update': requests.reload });
  // Banners from the admin; the two standard ones until the admin adds any.
  const banners: HomeBanner[] = live.data?.length
    ? live.data.map(b => ({
        key: b.id,
        title: b.title,
        sub: b.sub,
        tag: b.tag,
        image: b.hasImage ? apiUrl() + '/api/banners/' + b.id + '/image?v=' + b.imageVersion : null,
        art: ['other', 'notary'],
        go: () =>
          b.link.kind === 'offers' ? navigation.navigate('Offers') : b.link.kind === 'challan' ? navigation.navigate('Challan') : b.link.kind === 'gst' ? navigation.navigate('GstFiling') : b.link.kind === 'category' ? navigation.navigate('RequestNew', { category: b.link.value }) : b.link.kind === 'categories' ? navigation.navigate('Categories') : undefined,
      }))
    : BANNERS.map(b => ({ key: b.key, title: tr(b.title), sub: tr(b.sub), tag: tr(b.tag), image: null, art: b.art, go: () => navigation.navigate(b.go === 'challan' ? 'Challan' : 'Categories') }));
  const count = banners.length;
  useEffect(() => {
    const t = setInterval(() => {
      setSlide(i => {
        const n = (i + 1) % Math.max(1, count);
        scroller.current?.scrollTo({ x: n * (bannerW + 10), animated: true });
        return n;
      });
    }, 4500);
    return () => clearInterval(t);
  }, [bannerW, count]);

  const active = requests.data ?? [];
  const tileW = Math.floor((width - 28 - 24 - 30) / 4);
  const first = (me?.user.name ?? '').split(' ')[0] || '';
  const cats = (meta?.categories ?? []).map(c => categoryOf(c.key, meta));

  const tile = (k: string, label: string, onPress: () => void, badge?: string) => (
    <Tap key={k} onPress={onPress} style={{ width: tileW, alignItems: 'center', gap: 5 }} accessibilityRole="button" accessibilityLabel={label}>
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
      <T w="semibold" size={11.5} center lh={14} numberOfLines={label.includes(' ') ? 2 : 1} raw>
        {label}
      </T>
    </Tap>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ backgroundColor: colors.white, paddingTop: insets.top + 6, paddingHorizontal: 14, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Tap onPress={() => navigation.navigate('Profile')}>
            <Initials name={me?.user.name ?? ''} size={36} dark />
          </Tap>
          <View style={{ flex: 1 }}>
            <T w="bold" size={15} numberOfLines={1} raw>
              {tr('Namaste') + (first ? ', ' + first : '')}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <MapPin size={12} color={colors.goldText} />
              <T size={11.5} w="semibold" color={colors.muted} raw numberOfLines={1}>
                {[me?.city, me?.state].filter(Boolean).join(', ')}
              </T>
            </View>
          </View>
          <Tap
            onPress={() => navigation.navigate('Wallet')}
            accessibilityLabel={tr('Wallet balance')}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 5, height: 34, paddingHorizontal: 10, borderRadius: 999, backgroundColor: colors.goldTint }}>
            <WalletIcon size={15} color={colors.goldText} />
            <T w="bold" size={12.5} color={colors.goldText} raw>
              {wallet.data ? inr(wallet.data.balance) : '…'}
            </T>
          </Tap>
          <IconBtn icon={Bell} label="Notifications" bordered badge={unread > 0} onPress={() => navigation.navigate('Notifications')} />
        </View>
        <Tap onPress={() => navigation.navigate('Explore')} style={{ height: 42, borderRadius: 12, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
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
            {banners.map(b => (
              <Tap key={b.key} onPress={b.go} style={{ width: bannerW, height: 132, borderRadius: 14, overflow: 'hidden', backgroundColor: colors.ink }}>
                {b.image ? (
                  <Image source={{ uri: b.image }} style={{ position: 'absolute', right: 0, top: 0, width: bannerW * 0.55, height: 132, opacity: 0.85 }} resizeMode="cover" />
                ) : (
                  <View style={{ position: 'absolute', right: 6, top: 0 }}>
                    <GlowArt keys={b.art} width={bannerW * 0.42} height={132} />
                  </View>
                )}
                <View style={{ padding: 14, gap: 5, width: bannerW * 0.64, flex: 1, justifyContent: 'center' }}>
                  {b.tag ? (
                    <View style={{ alignSelf: 'flex-start', backgroundColor: colors.gold, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 2 }}>
                      <T w="bold" size={10} color={colors.ink} raw>
                        {b.tag}
                      </T>
                    </View>
                  ) : null}
                  <T w="serif" size={17} color={colors.white} lh={22} numberOfLines={2} raw>
                    {b.title}
                  </T>
                  <T size={11.5} w="medium" color={colors.onInkSoft} numberOfLines={1} raw>
                    {b.sub}
                  </T>
                </View>
              </Tap>
            ))}
          </ScrollView>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 5 }}>
            {banners.map((b, i) => (
              <View key={b.key} style={{ height: 5, width: i === slide ? 16 : 5, borderRadius: 3, backgroundColor: i === slide ? colors.ink : colors.lineStrong }} />
            ))}
          </View>
        </View>

        <View style={{ marginHorizontal: 14, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 12, gap: 12 }}>
          <SectionHeader title="Legal services" action="See all" onAction={() => navigation.navigate('Categories')} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 10, rowGap: 12 }}>
            {cats.map(c => tile(c.key, tr(c.short), () => navigation.navigate('RequestNew', { category: c.key })))}
            {tile('challan', tr('e-Challan'), () => navigation.navigate('Challan'), 'PAY')}
          </View>
        </View>

        {active.length ? (
          <View style={{ marginHorizontal: 14, gap: 8 }}>
            <SectionHeader title={tr('Your requests') + ' · ' + active.length} action="View all" onAction={() => navigation.navigate('Requests')} />
            {active.slice(0, 2).map(r => (
              <ActiveRequestCard key={r.id} r={r} onPress={() => navigation.navigate('RequestDetail', { id: r.id })} />
            ))}
          </View>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10, marginHorizontal: 14 }}>
          <QuickCard icon={Compass} title="Explore" sub="Verified advocates" onPress={() => navigation.navigate('Explore')} />
          <QuickCard icon={Receipt} title="GST filing" sub="Returns by our team" onPress={() => navigation.navigate('GstFiling')} />
          <QuickCard icon={Headset} title="Help desk" sub="Talk to our team" onPress={() => navigation.navigate('Help')} />
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

        <Tap
          onPress={() => navigation.navigate('Help')}
          style={{ marginHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 12 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
            <MessageCircle size={18} color={colors.green} />
          </View>
          <View style={{ flex: 1 }}>
            <T w="bold" size={13.5}>
              Need help choosing?
            </T>
            <T size={11.5} color={colors.muted}>
              Ask our team in the help desk
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
  const { meta } = useApp();
  const st = REQ_STATUS[r.status];
  const cat = categoryOf(r.category, meta);
  const cta = r.status === 'quoted' ? 'Pay' : r.status === 'done' ? 'Confirm' : null;
  return (
    <Card onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
      {r.advocate ? <SecureImage path={r.advocate.hasPhoto ? advPhoto(r) : null} style={{ width: 40, height: 40, borderRadius: 20 }} /> : <CategoryArt k={r.category} size={40} radius={10} />}
      <View style={{ flex: 1, gap: 3 }}>
        <T w="bold" size={13.5} raw numberOfLines={1}>
          {r.advocate ? r.advocate.name : tr(cat.name)}
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

/* ---------- explore (footer tab) ---------- */

type Listed = { id: string; name: string; designation: string; hasPhoto: boolean };

export function Explore({ navigation }: P) {
  const { meta } = useApp();
  useLang();
  const { width } = useWindowDimensions();
  const [cat, setCat] = useState('');
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 350);
    return () => clearTimeout(t);
  }, [typed]);
  const list = useApi<Listed[]>('/client/advocates?limit=60' + (cat ? '&category=' + cat : '') + (q ? '&q=' + encodeURIComponent(q) : ''));
  const cardW = (width - 28 - 10) / 2;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Explore advocates" sub="Verified by the Vakeel Bhai team" />
      <View style={{ backgroundColor: colors.white, paddingHorizontal: 14, paddingBottom: 10, gap: 10, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        <View style={{ height: 42, borderRadius: 12, backgroundColor: colors.surface2, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }}>
          <Search size={17} color={colors.muted} />
          <TextInput value={typed} onChangeText={setTyped} placeholder={tr('Search by name')} placeholderTextColor={colors.faint} style={{ flex: 1, fontSize: 14, color: colors.text, paddingVertical: 0 }} accessibilityLabel={tr('Search by name')} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Chip label="All" active={!cat} onPress={() => setCat('')} />
          {(meta?.categories ?? []).map(c => (
            <Chip key={c.key} label={c.short || c.name} raw active={cat === c.key} onPress={() => setCat(c.key)} />
          ))}
        </ScrollView>
      </View>
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={a => a.id}
          numColumns={2}
          columnWrapperStyle={{ gap: 10 }}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          refreshing={list.loading}
          onRefresh={list.reload}
          ListEmptyComponent={<EmptyState icon={UserRound} title="No advocates found" sub={q || cat ? 'Try another name or practice area.' : 'Verified advocates appear here once they join.'} />}
          ListFooterComponent={
            <View style={{ marginTop: 6, backgroundColor: colors.ink, borderRadius: 14, padding: 14, gap: 10 }}>
              <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                <ShieldCheck size={20} color={colors.gold} />
                <T size={12.5} color={colors.onInkSoft} lh={18} style={{ flex: 1 }}>
                  Tell us your problem and our team assigns a verified advocate from your district.
                </T>
              </View>
              <Button title="Request an advocate" small onPress={() => navigation.navigate('Categories')} />
            </View>
          }
          renderItem={({ item: a }) => (
            <View style={{ width: cardW, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 }}>
              <SecureImage path={a.hasPhoto ? '/client/advocates/' + a.id + '/photo' : null} style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 2, borderColor: colors.gold }} />
              <T w="bold" size={14} center numberOfLines={2} raw>
                {a.name}
              </T>
              <T size={12} color={colors.muted} center numberOfLines={1}>
                {a.designation}
              </T>
            </View>
          )}
        />
      )}
    </View>
  );
}

/* ---------- categories ---------- */

export function Categories({ navigation }: P) {
  const { meta } = useApp();
  useLang();
  const cats = meta?.categories ?? CATEGORIES.map(c => ({ key: c.key, name: c.name, short: c.short, covers: c.covers }));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Legal services" onBack={() => navigation.goBack()} />
      <Body gap={12}>
        {cats.map(c => (
          <Card key={c.key} onPress={() => navigation.navigate('RequestNew', { category: c.key })} style={{ flexDirection: 'row', gap: 14, alignItems: 'center', padding: 10 }}>
            <CategoryArt k={c.key} size={64} radius={12} />
            <View style={{ flex: 1, gap: 4 }}>
              <T w="bold" size={15} raw>
                {c.name}
              </T>
              <T size={12.5} color={colors.muted} lh={18} raw>
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
  const { prefs, meta } = useApp();
  const me = useClientMe();
  const keys = (meta?.categories ?? []).map(c => c.key);
  const wanted = route.params?.category;
  const [cat, setCat] = useState<string>(keys.includes(wanted) ? wanted : keys.includes('other') ? 'other' : keys[0] ?? 'other');
  const [issue, setIssue] = useState('');
  const [district, setDistrict] = useState(me?.city || 'Indore');
  const [lang, setLang] = useState(prefs.lang === 'en' ? 'English' : REQ_LANGS[LANGS.findIndex(l => l.code === prefs.lang) - 1] ?? 'हिन्दी');
  const [docs, setDocs] = useState<string[]>([]);
  const [pickCat, setPickCat] = useState(false);
  const [busy, setBusy] = useState('');
  const c = categoryOf(cat, meta);
  const tone = categoryTone[c.key] ?? categoryTone.other;
  const ok = issue.trim().length >= 15;

  const addDoc = () =>
    Alert.alert(tr('Add a document'), tr('Photograph a paper or pick an image'), [
      { text: tr('Camera'), onPress: async () => { const u = await takePhoto(); if (u) setDocs(d => [...d, u]); } },
      { text: tr('Gallery'), onPress: async () => { const u = await choosePhoto(); if (u) setDocs(d => [...d, u]); } },
      { text: tr('Cancel'), style: 'cancel' },
    ]);

  const submit = async () => {
    setBusy(tr('Sending your request…'));
    let id: string;
    try {
      id = (await api('/client/requests', { method: 'POST', body: { category: cat, issue: issue.trim(), district, language: lang } })).data.id;
    } catch (e) {
      setBusy('');
      Alert.alert(tr('Could not send the request'), errText(e));
      return;
    }
    let failed = 0;
    for (let i = 0; i < docs.length; i++) {
      setBusy(tr('Uploading document {a} of {b}…', { a: i + 1, b: docs.length }));
      try {
        await api('/client/requests/' + id + '/attachments', { method: 'POST', form: photoForm(docs[i]) });
      } catch {
        failed++;
      }
    }
    setBusy('');
    if (failed) Alert.alert(tr('Request sent'), tr('{n} document(s) could not be uploaded. You can share them in the chat later.', { n: failed }));
    navigation.replace('RequestSubmitted', { id });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Request an advocate" onBack={() => navigation.goBack()} />
      <Body gap={18}>
        <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center', backgroundColor: tone.bg, borderRadius: 14, padding: 12 }}>
          <CategoryArt k={c.key} size={52} radius={12} plain />
          <View style={{ flex: 1 }}>
            <T w="bold" size={16} color={tone.fg} raw>
              {c.name}
            </T>
            <T size={12} w="medium" color={tone.fg} lh={17} raw>
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
            {(meta?.categories ?? []).map(k => (
              <Chip key={k.key} label={k.short || k.name} raw active={k.key === cat} onPress={() => { setCat(k.key); setPickCat(false); }} />
            ))}
          </View>
        ) : null}

        <View style={{ gap: 4 }}>
          <Field label="Tell us what happened" value={issue} onChangeText={setIssue} multiline maxLength={1000} placeholder="Describe your problem in your own words. Mention dates, places and what you want to achieve." />
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
            {docs.length < 5 ? (
              <Tap
                accessibilityLabel={tr('Add document')}
                onPress={addDoc}
                style={{ width: 76, height: 76, borderRadius: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B8B0A0', alignItems: 'center', justifyContent: 'center' }}>
                <Plus size={22} color={colors.muted} />
              </Tap>
            ) : null}
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
        <Button title={busy || 'Submit request'} disabled={!ok} loading={!!busy} onPress={submit} />
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
      <View style={{ gap: 10, marginTop: 8 }}>
        <Button title="Track my request" onPress={() => navigation.replace('RequestDetail', { id })} />
        <Button title="Back to home" variant="line" onPress={() => navigation.popTo('ClientTabs', { screen: 'Home' })} />
      </View>
    </View>
  );
}

/* ---------- requests ---------- */

export function Requests({ navigation }: P) {
  const { meta } = useApp();
  useLang();
  const [tab, setTab] = useState<'active' | 'completed'>('active');
  const list = useApi<ClientRequest[]>('/client/requests?tab=' + tab);
  useLive({ 'request:update': list.reload, reconnect: list.reload });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="My requests" right={<IconBtn icon={Plus} label="New request" onPress={() => navigation.navigate('Categories')} />} />
      <View style={{ flexDirection: 'row', backgroundColor: colors.white, borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {(['active', 'completed'] as const).map(k => (
          <Tap key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
            <T w="semibold" size={14} color={tab === k ? colors.ink : colors.muted}>
              {k === 'active' ? 'Active' : 'Completed'}
            </T>
          </Tap>
        ))}
      </View>
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={r => r.id}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          refreshing={list.loading}
          onRefresh={list.reload}
          ListEmptyComponent={
            <EmptyState
              icon={FileText}
              title={tab === 'active' ? 'No active requests' : 'Nothing completed yet'}
              sub="Pick a legal service and describe your problem. A verified advocate will contact you here."
              action="Request an advocate"
              onAction={() => navigation.navigate('Categories')}
            />
          }
          renderItem={({ item: r }) => {
            const c = categoryOf(r.category, meta);
            const st = REQ_STATUS[r.status];
            return (
              <Card onPress={() => navigation.navigate('RequestDetail', { id: r.id })} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <CategoryArt k={r.category} size={46} radius={10} />
                  <View style={{ flex: 1 }}>
                    <T w="bold" size={14.5} raw>
                      {c.name}
                    </T>
                    <T size={12} w="medium" color={colors.muted} raw>
                      {r.id + ' · ' + ago(ts(r.createdAt))}
                    </T>
                  </View>
                  <Pill label={st.label} tone={st.tone} />
                </View>
                <T size={13} color={colors.text2} numberOfLines={2} raw>
                  {r.issue}
                </T>
                {r.advocate ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <SecureImage path={r.advocate.hasPhoto ? advPhoto(r) : null} style={{ width: 24, height: 24, borderRadius: 12 }} />
                    <T size={12.5} w="semibold" color={colors.text2} raw>
                      {r.advocate.name}
                    </T>
                  </View>
                ) : null}
              </Card>
            );
          }}
        />
      )}
    </View>
  );
}

export function RequestDetail({ navigation, route }: P) {
  const { meta } = useApp();
  useLang();
  const id = route.params?.id;
  const { data: r, error, reload } = useApi<ClientRequest>('/client/requests/' + id);
  useLive({ 'request:update': p => p.number === id && reload(), reconnect: reload });
  if (error) return <Shell title={id} onBack={() => navigation.goBack()}><LoadError error={error} onRetry={reload} /></Shell>;
  if (!r) return <Shell title={id} onBack={() => navigation.goBack()}><Loading /></Shell>;
  const c = categoryOf(r.category, meta);
  const adv = r.advocate;
  const st = REQ_STATUS[r.status];
  const order = ['submitted', 'assigned', 'quoted', 'paid', 'done', 'completed'];
  const at = r.status === 'disputed' ? 4 : order.indexOf(r.status);
  const step = (i: number) => (i < at || r.status === 'completed' ? 'done' : i === at ? 'now' : 'todo') as 'done' | 'now' | 'todo';
  const autoDays = r.autoConfirmAt ? Math.max(0, Math.ceil((ts(r.autoConfirmAt) - Date.now()) / 86400000)) : meta?.autoConfirmDays ?? 7;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={c.name} sub={r.id} onBack={() => navigation.goBack()} right={<Pill label={st.label} tone={st.tone} />} />
      <Body>
        {adv ? (
          <Card onPress={() => navigation.navigate('AdvocateProfile', { id: r.id })}>
            <AdvocateRow a={adv} photoPath={advPhoto(r)} right={<ChevronRight size={18} color={colors.muted} />} />
          </Card>
        ) : r.status === 'submitted' ? (
          <Note tone="neutral" icon={ShieldCheck}>
            Our team is choosing a verified advocate for you. You will get a notification.
          </Note>
        ) : null}

        {r.status === 'quoted' && r.quote ? (
          <Card style={{ borderColor: colors.ink, borderWidth: 1.5, gap: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <T w="bold" size={13} color={colors.goldText}>
                Fee quote
              </T>
              <T size={12} color={colors.muted} raw>
                {tr('Valid till {d}', { d: dateShort(ts(r.quote.validTill)) })}
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
              {tr('Confirm to release the payment to your advocate. If you do nothing, it confirms automatically in {d} days.', { d: autoDays })}
            </T>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Confirm" style={{ flex: 1 }} onPress={() => navigation.navigate('Confirm', { id: r.id })} />
              <Button title="Raise a dispute" variant="danger" onPress={() => navigation.navigate('Dispute', { id: r.id })} />
            </View>
          </Card>
        ) : null}
        {r.status === 'paid' ? (
          <Tap onPress={() => navigation.navigate('Dispute', { id: r.id })} hitSlop={8} style={{ alignSelf: 'flex-end' }}>
            <T w="semibold" size={12.5} color={colors.red}>
              Problem with the work? Raise a dispute
            </T>
          </Tap>
        ) : null}
        {r.status === 'disputed' && r.dispute ? <Note tone="orange">{tr('Dispute raised') + ': ' + r.dispute.reason + '. ' + tr('Our team replies in the chat within 24 hours. The payment stays on hold.')}</Note> : null}
        {r.status === 'refunded' ? <Note tone="neutral">{tr('Our team refunded this payment in full.') + (r.dispute?.note ? ' ' + r.dispute.note : '')}</Note> : null}

        {!['refunded', 'cancelled'].includes(r.status) ? (
          <Card>
            <Timeline
              steps={[
                { title: 'Request submitted', sub: dateShort(ts(r.createdAt)), state: step(0) },
                { title: 'Advocate assigned', sub: adv?.name, state: step(1) },
                { title: 'Fee quote', sub: r.quote ? inr(r.quote.fee) : undefined, state: step(2) },
                { title: 'Paid', sub: r.paid ? inr(r.paid.total) + ' · ' + tr('held safely') : undefined, state: step(3) },
                { title: r.status === 'disputed' ? 'Disputed' : 'Work done', sub: r.status === 'disputed' ? tr('Our team is reviewing') : undefined, state: step(4) },
                { title: 'Confirmed', state: step(5) },
              ]}
            />
          </Card>
        ) : null}

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
          {r.docs.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingTop: 4 }}>
              {r.docs.map(d => (
                <SecureImage key={d.id} path={'/client/requests/' + r.id + '/attachments/' + d.id} fallback="image" style={{ width: 64, height: 64, borderRadius: 10 }} />
              ))}
            </ScrollView>
          ) : null}
        </Card>

        {r.paid ? (
          <Card style={{ gap: 8 }}>
            <T w="bold" size={14}>
              Payment
            </T>
            <BillRow label="Advocate's fee" value={inr(r.paid.fee)} />
            {r.paid.discount ? <BillRow label="Offer" value={'−' + inr(r.paid.discount)} color={colors.green} /> : null}
            <BillRow label="GST" value={inr(r.paid.gst)} />
            {r.paid.wallet ? <BillRow label="Wallet" value={'−' + inr(r.paid.wallet)} color={colors.green} /> : null}
            <Divider />
            <BillRow label="Paid" value={inr(r.paid.total)} strong />
            <T size={11.5} color={colors.muted} raw>
              {tr('Payment') + ' ' + r.paid.id + ' · ' + dateShort(ts(r.paid.at)) + (r.paid.refund ? ' · ' + tr('refund') + ' ' + r.paid.refund : '')}
            </T>
            <Tap onPress={() => openInvoice(r.paid!.id)} hitSlop={6}>
              <T w="semibold" size={13} color={colors.goldText}>
                Download GST invoice
              </T>
            </Tap>
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
        <Tap onPress={() => navigation.navigate('NewTicket', { topic: 'services', ref: r.id })} hitSlop={8}>
          <T w="semibold" size={12.5} color={colors.goldText} center>
            Need help with this request? Contact support
          </T>
        </Tap>
      </Body>
      {adv ? (
        <BottomBar>
          <Button title="Open chat" variant="ink" icon={MessageCircle} onPress={() => navigation.navigate('Chat', { id: r.id, side: 'client' })} />
        </BottomBar>
      ) : null}
    </View>
  );
}

/** App bar + body for loading and error states. */
function Shell({ title, onBack, children }: { title?: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={title} onBack={onBack} />
      {children}
    </View>
  );
}

/* ---------- checkout ---------- */

type Bill = { fee: number; discount: number; base: number; gst: number; gstPercent: number; gstOnService: boolean; wallet: number; walletBalance: number; total: number; offer: { title: string; code: string | null; kind: string; cashback: number } | null };

export function Checkout({ navigation, route }: P) {
  const { meta } = useApp();
  useLang();
  const id = route.params?.id;
  const req = useApi<ClientRequest>('/client/requests/' + id);
  const [useWallet, setUseWallet] = useState(true);
  const [typed, setTyped] = useState('');
  const [code, setCode] = useState('');
  const bill = useApi<Bill>('/client/requests/' + id + '/checkout?useWallet=' + (useWallet ? '1' : '0') + (code ? '&code=' + encodeURIComponent(code) : ''));
  // A coupon that does not apply: show why and go back to the bill without it.
  const [codeError, setCodeError] = useState('');
  useEffect(() => {
    if (code && bill.error) {
      setCodeError(bill.error);
      setCode('');
    }
  }, [bill.error, code]);
  const [paying, setPaying] = useState(false);
  const { pay, sheet } = usePay();
  const r = req.data;
  const b = bill.data;
  // A coupon error is shown under the coupon field, not as a page error.
  const err = req.error || (code || codeError ? '' : bill.error);
  if (err) return <Shell title="Checkout" onBack={() => navigation.goBack()}><LoadError error={err} onRetry={() => { req.reload(); bill.reload(); }} /></Shell>;
  if (!r || !b) return <Shell title="Checkout" onBack={() => navigation.goBack()}><Loading /></Shell>;
  const c = categoryOf(r.category, meta);

  const go = async () => {
    setPaying(true);
    try {
      const co = (await api('/client/requests/' + r.id + '/checkout', { method: 'POST', body: { useWallet: useWallet && b.walletBalance > 0, ...(code ? { code } : {}) } })).data;
      const paid: any = await pay(co);
      navigation.replace('PaymentDone', { id: r.id, total: paid?.total != null ? paid.total + (paid.wallet ?? 0) : b.total });
    } catch (e: any) {
      setPaying(false);
      if (e?.code !== 'CANCELLED') Alert.alert(tr('Payment not completed'), errText(e));
      bill.reload();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Checkout" onBack={() => navigation.goBack()} />
      <Body gap={14}>
        <Card style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          {r.advocate ? <SecureImage path={r.advocate.hasPhoto ? advPhoto(r) : null} style={{ width: 48, height: 48, borderRadius: 12 }} /> : null}
          <View style={{ flex: 1 }}>
            <T w="bold" size={14} raw>
              {c.name}
            </T>
            <T size={12} w="medium" color={colors.muted} raw>
              {(r.advocate?.name ?? '') + ' · ' + tr('Request') + ' ' + r.id}
            </T>
          </View>
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
              {inr(b.walletBalance) + ' ' + tr('available')}
            </T>
          </View>
          <Toggle value={useWallet && b.walletBalance > 0} onChange={v => b.walletBalance > 0 && setUseWallet(v)} label="Use wallet" />
        </Card>
        <Card style={{ gap: 8 }}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: colors.goldTint, alignItems: 'center', justifyContent: 'center' }}>
              <Tag size={20} color={colors.goldText} />
            </View>
            <TextInput
              value={code || typed}
              editable={!code}
              onChangeText={t => setTyped(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
              placeholder={tr('Coupon code')}
              placeholderTextColor={colors.faint}
              autoCapitalize="characters"
              maxLength={20}
              style={{ flex: 1, height: 42, borderRadius: 10, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 12, fontSize: 14, fontWeight: '700', color: colors.text }}
            />
            {code ? (
              <Button title="Remove" small variant="line" onPress={() => { setCode(''); setTyped(''); }} />
            ) : (
              <Button title="Apply" small variant="line" disabled={typed.length < 3} onPress={() => { setCodeError(''); setCode(typed); }} />
            )}
          </View>
          {codeError ? (
            <T size={12} color={colors.red} raw>
              {codeError}
            </T>
          ) : null}
          {b.offer ? (
            <T size={12.5} w="semibold" color={colors.green} raw>
              {(b.offer.code ? b.offer.code + ' · ' : tr('Applied automatically') + ' · ') + b.offer.title + (b.offer.cashback ? ' · ' + tr('{x} cashback to your wallet after you confirm the work', { x: inr(b.offer.cashback) }) : '')}
            </T>
          ) : (
            <Tap onPress={() => navigation.navigate('Offers')} hitSlop={6}>
              <T size={12.5} w="semibold" color={colors.goldText}>
                See offers
              </T>
            </Tap>
          )}
        </Card>
        <Card style={{ gap: 10, opacity: bill.loading ? 0.6 : 1 }}>
          <T w="bold" size={15}>
            Bill details
          </T>
          <BillRow label="Advocate's fee" value={inr(b.fee)} />
          {b.discount ? <BillRow label={tr('Offer') + (b.offer?.code ? ' ' + b.offer.code : '')} value={'−' + inr(b.discount)} color={colors.green} raw /> : null}
          <BillRow label={b.gstOnService ? tr('GST {p}% on {x}', { p: b.gstPercent, x: inr(b.base) }) : tr('GST (not charged on this service)')} value={inr(b.gst)} raw />
          {b.wallet ? <BillRow label="Wallet" value={'−' + inr(b.wallet)} color={colors.green} /> : null}
          <Divider />
          <BillRow label="To pay" value={inr(b.total)} strong />
        </Card>
        <Note icon={ShieldCheck}>Vakeel Bhai holds this payment. It goes to your advocate only after you confirm the work is done.</Note>
      </Body>
      <BottomBar row>
        <View>
          <T w="extrabold" size={19} raw>
            {inr(b.total)}
          </T>
          <T size={11.5} w="medium" color={colors.muted}>
            {b.total > 0 ? 'UPI, cards, netbanking' : 'Paid from your wallet'}
          </T>
        </View>
        <Button title={paying ? 'Processing…' : 'Pay securely'} loading={paying} disabled={bill.loading} onPress={go} style={{ flex: 1 }} />
      </BottomBar>
      {sheet}
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
  const id = route.params?.id;
  const { data: r } = useApi<ClientRequest>('/client/requests/' + id);
  const [stars, setStars] = useState(5);
  const [review, setReview] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api('/client/requests/' + id + '/confirm', { method: 'POST', body: { rating: stars, ...(review.trim() ? { review: review.trim() } : {}) } });
      navigation.goBack();
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Could not confirm'), errText(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Confirm and rate" onBack={() => navigation.goBack()} />
      <Body>
        {r?.advocate ? (
          <Card>
            <AdvocateRow a={r.advocate} photoPath={advPhoto(r)} />
          </Card>
        ) : null}
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
        <Field label="Review (optional)" value={review} onChangeText={setReview} multiline maxLength={1000} placeholder="What went well? Your review helps other clients." />
        <Note icon={ShieldCheck}>Confirming releases the payment to the advocate. Do this only when the work you agreed on is done.</Note>
      </Body>
      <BottomBar>
        <Button title="Confirm work is done" loading={busy} onPress={send} />
      </BottomBar>
    </View>
  );
}

const DISPUTE_REASONS = ['Work not done as agreed', 'Advocate stopped responding', 'Charged more than the quote', 'Other'];

export function Dispute({ navigation, route }: P) {
  const [reason, setReason] = useState(DISPUTE_REASONS[0]);
  const [detail, setDetail] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    setBusy(true);
    try {
      await api('/client/requests/' + route.params.id + '/dispute', { method: 'POST', body: { reason: tr(reason) + ': ' + detail.trim() } });
      navigation.goBack();
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Could not raise the dispute'), errText(e));
    }
  };
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
        <Field label="Tell us more" value={detail} onChangeText={setDetail} multiline maxLength={900} placeholder="What happened?" />
      </Body>
      <BottomBar>
        <Button title="Submit dispute" variant="ink" loading={busy} disabled={detail.trim().length < 10} onPress={send} />
      </BottomBar>
    </View>
  );
}

/** The advocate on one of the client's requests (params.id = request number). */
export function AdvocateProfile({ navigation, route }: P) {
  const { meta } = useApp();
  const id = route.params?.id;
  const { data: r, error, reload } = useApi<ClientRequest>('/client/requests/' + id);
  const a = r?.advocate;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Advocate profile" onBack={() => navigation.goBack()} />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !r ? (
        <Loading />
      ) : !a ? (
        <EmptyState title="No advocate yet" />
      ) : (
        <Body>
          <Card style={{ alignItems: 'center', gap: 10, paddingVertical: 22 }}>
            <SecureImage path={a.hasPhoto ? advPhoto(r) : null} style={{ width: 96, height: 96, borderRadius: 48, borderWidth: 3, borderColor: colors.gold }} />
            <T w="serif" size={20} raw>
              {a.name}
            </T>
            {a.verified ? <Pill label="Verified advocate" tone="ink" dot={false} /> : null}
          </Card>
          <Card style={{ gap: 12 }}>
            <BillRow label="Practice" value={a.practice.map(p => categoryOf(p, meta).short).join(', ')} raw />
            {a.years != null ? <BillRow label="Experience" value={a.years + ' ' + tr('years')} raw /> : null}
            {a.court ? <BillRow label="Court" value={a.court} raw /> : null}
            {a.district ? <BillRow label="District" value={a.district} raw /> : null}
          </Card>
          <Note icon={ShieldCheck}>Bar Council documents checked by the Vakeel Bhai team. Phone numbers are never shared. Talk in the private chat.</Note>
        </Body>
      )}
    </View>
  );
}

/* ---------- offers, wallet, refer ---------- */

type LiveOffer = { id: string; title: string; description: string; code: string | null; label: string; categories: string[]; minOrder: number; firstServiceOnly: boolean; endAt: string; used: boolean };

export function Offers({ navigation }: P) {
  const { meta } = useApp();
  useLang();
  const list = useApi<LiveOffer[]>('/client/offers');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Offers" onBack={() => navigation.goBack()} />
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={o => o.id}
          refreshing={list.loading}
          onRefresh={list.reload}
          contentContainerStyle={{ padding: 14, gap: 12 }}
          ListEmptyComponent={<EmptyState icon={Tag} title="No offers right now" sub="New offers appear here when Vakeel Bhai runs them." />}
          ListFooterComponent={
            <T size={12} color={colors.muted} center style={{ marginTop: 4 }}>
              Discounts apply to the advocate's fee. GST is calculated after the discount.
            </T>
          }
          renderItem={({ item: o }) => (
            <Card style={{ padding: 0, overflow: 'hidden' }}>
              <View style={{ backgroundColor: colors.ink, padding: 16, gap: 4 }}>
                <T w="extrabold" size={24} color={colors.gold} raw>
                  {o.label}
                </T>
                <T w="semibold" size={14} color={colors.white} raw>
                  {o.title}
                </T>
              </View>
              <View style={{ padding: 14, gap: 8 }}>
                {o.description ? (
                  <T size={13} color={colors.text2} raw>
                    {o.description}
                  </T>
                ) : null}
                <T size={12} color={colors.muted} raw>
                  {(o.categories.length ? o.categories.map(k => categoryOf(k, meta).short).join(', ') : tr('All legal services')) + (o.minOrder ? ' · ' + tr('fee from {x}', { x: inr(o.minOrder) }) : '') + (o.firstServiceOnly ? ' · ' + tr('first paid service only') : '') + ' · ' + tr('till {d}', { d: dateShort(ts(o.endAt)) })}
                </T>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  {o.code ? (
                    <View style={{ borderWidth: 1, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.goldWash }}>
                      <T w="extrabold" size={13} color={colors.goldText} raw>
                        {o.code}
                      </T>
                    </View>
                  ) : (
                    <Pill label="Applies automatically" tone="blue" dot={false} />
                  )}
                  <T size={12} w="semibold" color={o.used ? colors.muted : colors.green}>
                    {o.used ? 'Used' : 'Available'}
                  </T>
                </View>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

type Referral = { code: string; enabled: boolean; rewardType: 'flat' | 'percent' | null; reward: number | null; monthlyCap: number | null; canApplyCode: boolean; friends: { name: string; joinedAt: string; rewarded: boolean; reward: number | null }[] };

export function Refer({ navigation }: P) {
  useLang();
  const r = useApi<Referral>('/client/referral');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const d = r.data;
  const apply = async () => {
    setBusy(true);
    try {
      await api('/client/referral/apply', { method: 'POST', body: { code: code.trim().toUpperCase() } });
      Alert.alert(tr('Code applied'), tr('Your friend earns a reward when your first paid service is done.'));
      r.reload();
    } catch (e) {
      Alert.alert(tr('Could not apply'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  const reward = !d || d.reward == null ? tr('a reward') : d.rewardType === 'flat' ? inr(d.reward) : tr('{p}% of their first fee', { p: d.reward });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Refer and earn" onBack={() => navigation.goBack()} />
      {r.error ? (
        <LoadError error={r.error} onRetry={r.reload} />
      ) : !d ? (
        <Loading />
      ) : (
        <Body>
          <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 20, gap: 14, alignItems: 'center' }}>
            <Gift size={40} color={colors.gold} />
            <T w="serif" size={22} color={colors.white} center raw>
              {tr('Earn {x} for every friend', { x: reward })}
            </T>
            <T size={13.5} color={colors.onInkSoft} center lh={20} raw>
              {tr('When a friend joins with your code and completes their first paid service, the reward lands in your wallet.') + (d.monthlyCap ? ' ' + tr('Up to {x} a month.', { x: inr(d.monthlyCap) }) : '')}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.gold, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 }}>
              <T w="extrabold" size={20} color={colors.gold} raw style={{ letterSpacing: 1 }}>
                {d.code}
              </T>
            </View>
          </View>
          <Button title="Share my code" icon={Share2} onPress={() => Share.share({ message: tr('Get legal help from verified advocates on Vakeel Bhai. Use my code {code} when you sign up.', { code: d.code }) }).catch(() => {})} />
          {!d.enabled ? <Note tone="orange">Refer and earn is paused right now. Your code still works; rewards are paid while it is on.</Note> : null}
          {d.canApplyCode ? (
            <Card style={{ gap: 10 }}>
              <T w="bold" size={14}>
                Got a code from a friend?
              </T>
              <Field value={code} onChangeText={t => setCode(t.toUpperCase().replace(/[^A-Z0-9]/g, ''))} placeholder="e.g. VBRAHUL123" maxLength={20} autoCapitalize="characters" />
              <Button title="Apply code" small variant="line" loading={busy} disabled={code.length < 5} onPress={apply} />
              <T size={12} color={colors.muted}>
                Only before your first paid service.
              </T>
            </Card>
          ) : null}
          <Card style={{ gap: 10 }}>
            <T w="bold" size={14}>
              Your referrals
            </T>
            {d.friends.length === 0 ? (
              <T size={13} color={colors.muted}>
                No friends have joined with your code yet.
              </T>
            ) : (
              d.friends.map((f, i) => <BillRow key={i} label={f.name + ' · ' + tr(f.rewarded ? 'first service done' : 'joined')} value={f.rewarded && f.reward != null ? '+' + inr(f.reward) : tr('Waiting')} color={f.rewarded ? colors.green : undefined} raw />)
            )}
          </Card>
        </Body>
      )}
    </View>
  );
}

type Tx = { id: string; type: string; title: string; sub: string; amount: number; at: string; status: string | null };

export function ClientWallet() {
  useLang();
  const w = useApi<{ balance: number; tx: Tx[] }>('/client/wallet');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Wallet" />
      {w.error ? (
        <LoadError error={w.error} onRetry={w.reload} />
      ) : !w.data ? (
        <Loading />
      ) : (
        <FlatList
          data={w.data.tx}
          keyExtractor={t => t.id}
          refreshing={w.loading}
          onRefresh={w.reload}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListHeaderComponent={
            <View style={{ gap: 12, marginBottom: 2 }}>
              <View style={{ backgroundColor: colors.ink, borderRadius: 18, padding: 18, gap: 12 }}>
                <T size={12} w="medium" color={colors.onInkMuted}>
                  Wallet balance
                </T>
                <T w="extrabold" size={32} color={colors.white} raw>
                  {inr(w.data.balance)}
                </T>
                <T size={12.5} color={colors.onInkSoft} lh={18}>
                  Use it at checkout. Refunds, referral rewards and cashback land here. Wallet money cannot be withdrawn.
                </T>
              </View>
              <SectionHeader title="History" />
            </View>
          }
          ListEmptyComponent={<EmptyState title="No transactions yet" />}
          renderItem={({ item: t }) => (
            <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: t.amount >= 0 ? colors.greenSoft : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
                {t.amount >= 0 ? <Gift size={19} color={colors.green} /> : <Receipt size={19} color={colors.text2} />}
              </View>
              <View style={{ flex: 1 }}>
                <T w="bold" size={14} raw>
                  {t.title}
                </T>
                <T size={12} color={colors.muted} raw>
                  {(t.sub ? t.sub + ' · ' : '') + dateShort(ts(t.at))}
                </T>
              </View>
              <T w="extrabold" size={15} color={t.amount >= 0 ? colors.green : colors.text} raw>
                {(t.amount >= 0 ? '+' : '') + inr(t.amount)}
              </T>
            </Card>
          )}
        />
      )}
    </View>
  );
}

/* ---------- profile ---------- */

export function ClientProfile({ navigation }: P) {
  const { prefs, logout } = useApp();
  const me = useClientMe();
  useLang();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Profile" />
      <Body>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <Initials name={me?.user.name ?? ''} size={56} dark />
          <View style={{ flex: 1 }}>
            <T w="bold" size={17} raw>
              {me?.user.name ?? ''}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {'+91 ' + phonePretty(me?.user.phone ?? '')}
            </T>
            <T size={12.5} color={colors.muted} raw>
              {me?.user.email || tr('Add email for invoices')}
            </T>
          </View>
          <IconBtn icon={Pencil} label="Edit profile" onPress={() => navigation.navigate('EditClient')} />
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={FileText} title="My requests" onPress={() => navigation.navigate('Requests')} />
          <Divider />
          <ListRow icon={Car} title="e-Challan" sub="Vehicles and receipts" onPress={() => navigation.navigate('Challan')} />
          <Divider />
          <ListRow icon={Receipt} title="GST filing" onPress={() => navigation.navigate('GstFiling')} />
          <Divider />
          <ListRow icon={Gift} title="Refer and earn" onPress={() => navigation.navigate('Refer')} />
          <Divider />
          <ListRow icon={Tag} title="Offers" onPress={() => navigation.navigate('Offers')} />
          <Divider />
          <ListRow icon={FileText} title="My invoices" sub="GST invoice for every payment" onPress={() => navigation.navigate('Invoices')} />
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
