import React, { useEffect, useState } from 'react';
import { Alert, TextInput, View } from 'react-native';
import { Bike, Bus, Car, CircleCheck, Clock, MessageCircle, Plus, Receipt, Search, Trash2, Truck, Upload } from 'lucide-react-native';
import T from '../components/T';
import { AppBar, BillRow, Body, BottomBar, Button, Card, CheckBox, Chip, Divider, EmptyState, Field, Note, Pill, Tap, Timeline } from '../components/ui';
import { LoadError, Loading, SecureImage, usePay } from '../components/data';
import { colors, font } from '../theme';
import { plateOk, VEHICLE_TYPES } from '../data/catalog';
import { useApp } from '../store/AppStore';
import { api, errText, photoForm } from '../api/client';
import { choosePhoto, takePhoto } from '../utils/media';
import { useApi } from '../api/hooks';
import { useLive } from '../api/live';
import { inr } from '../utils/money';
import { dateShort, time } from '../utils/format';
import { tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

/* ---------- e-Challan ---------- */

type Vehicle = { id: string; plate: string; number: string; type: string };
type ChallanRow = { id: string; offence: string; amount: number; date: string; place: string; court: boolean; state: 'due' | 'processing' | 'paid'; order: string | null };
type Order = {
  id: string;
  vehicle: { plate: string; number: string; type: string };
  items: { id: string; offence: string; amount: number; date: string; place: string; court: boolean }[];
  amounts: { challans: number; fee: number; gst: number; total: number; gstPercent: number };
  status: 'processing' | 'completed' | 'refunded' | 'awaiting_payment' | 'cancelled';
  payWithinHours: number;
  paidAt: string | null;
  dueBy: string | null;
  completedAt: string | null;
  departmentRef: string | null;
  note: string | null;
};

const ICON: Record<string, any> = { bike: Bike, car: Car, auto: Bus, commercial: Truck, other: Car };
const typeLabel = (k: string) => VEHICLE_TYPES.find(v => v.key === k)?.label ?? 'Vehicle';
const ts = (d?: string | null) => (d ? new Date(d).getTime() : 0);
const when = (d?: string | null) => (d ? dateShort(ts(d)) + ', ' + time(ts(d)) : '');
const r2 = (n: number) => Math.round(n * 100) / 100;

const ORDER_PILL: Record<string, { label: string; tone: any }> = {
  processing: { label: 'Paying to the department', tone: 'orange' },
  completed: { label: 'Paid to the department', tone: 'green' },
  refunded: { label: 'Refunded', tone: 'red' },
};

/** Step 1 vehicle type, step 2 number plate. */
function AddVehicle({ onAdded, onCancel }: { onAdded: (v: Vehicle) => void; onCancel?: () => void }) {
  const [type, setType] = useState('');
  const [plate, setPlate] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => {
    setBusy(true);
    try {
      onAdded((await api('/client/vehicles', { method: 'POST', body: { plate, type } })).data);
    } catch (e) {
      Alert.alert(tr('Could not add the vehicle'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card style={{ gap: 14 }}>
      <T w="bold" size={15}>
        1. Vehicle type
      </T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {VEHICLE_TYPES.map(v => {
          const on = type === v.key;
          const Icon = ICON[v.key];
          return (
            <Tap
              key={v.key}
              onPress={() => setType(v.key)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={{ width: '31%', flexGrow: 1, alignItems: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: on ? 2 : 1, borderColor: on ? colors.ink : colors.line, backgroundColor: on ? colors.ink : colors.white }}>
              <Icon size={24} color={on ? colors.gold : colors.text2} />
              <T w="semibold" size={12} color={on ? colors.white : colors.text} center>
                {v.label}
              </T>
            </Tap>
          );
        })}
      </View>
      <T w="bold" size={15}>
        2. Number plate
      </T>
      <TextInput
        value={plate}
        onChangeText={t => setPlate(t.toUpperCase())}
        placeholder="MP 09 AB 1234"
        placeholderTextColor={colors.faint}
        autoCapitalize="characters"
        maxLength={15}
        editable={!!type}
        accessibilityLabel={tr('Number plate')}
        style={{ height: 56, borderRadius: 12, borderWidth: 2, borderColor: type ? colors.gold : colors.line, backgroundColor: type ? colors.white : colors.surface2, paddingHorizontal: 16, fontFamily: font.extrabold, fontSize: 20, letterSpacing: 2, color: colors.text }}
      />
      {plate && !plateOk(plate) ? (
        <T size={12} color={colors.orange}>
          Enter the number as written on the plate, e.g. MP 09 AB 1234
        </T>
      ) : null}
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Find challans" icon={Search} loading={busy} disabled={!type || !plateOk(plate)} onPress={add} style={{ flex: 1 }} />
        {onCancel ? <Button title="Cancel" variant="line" onPress={onCancel} /> : null}
      </View>
    </Card>
  );
}

export function Challan({ navigation }: P) {
  const { meta } = useApp();
  useLang();
  const vehicles = useApi<Vehicle[]>('/client/vehicles');
  const [vid, setVid] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'pending' | 'orders'>('pending');
  const list = vehicles.data ?? [];
  const v = list.find(x => x.id === vid) ?? list[0];
  const challans = useApi<{ challans: ChallanRow[] }>(v && tab === 'pending' && !adding ? '/client/vehicles/' + v.id + '/challans' : null);
  const orders = useApi<Order[]>(tab === 'orders' ? '/client/challans/orders' : null);
  const [sel, setSel] = useState<string[]>([]);
  const [paying, setPaying] = useState(false);
  const { pay, sheet } = usePay();
  useLive({ 'challan:update': () => { challans.reload(); orders.reload(); } });
  useEffect(() => setSel([]), [v?.id]);

  const cfg = meta?.challan;
  const hours = cfg?.payWithinHours ?? 24;
  const gstRate = meta?.rates.gst ?? 0.18;
  const due = (challans.data?.challans ?? []).filter(c => c.state === 'due');
  const chosen = due.filter(c => sel.includes(c.id));
  // Preview only: the server prices the checkout itself (same formula).
  const sum = r2(chosen.reduce((a, c) => a + c.amount, 0));
  const charge = r2((cfg?.fee ?? 0) * chosen.length);
  const gst = r2(charge * gstRate);
  const total = r2(sum + charge + gst);

  const checkout = async () => {
    if (!v) return;
    setPaying(true);
    try {
      const co = (await api('/client/challans/checkout', { method: 'POST', body: { vehicleId: v.id, challans: chosen.map(c => c.id) } })).data;
      await pay(co);
      setSel([]);
      navigation.navigate('ChallanReceipt', { id: co.order.id });
    } catch (e: any) {
      if (e?.code !== 'CANCELLED') Alert.alert(tr('Payment not completed'), errText(e));
      challans.reload();
    } finally {
      setPaying(false);
    }
  };

  const remove = () =>
    v &&
    Alert.alert(tr('Remove {n}?', { n: v.number }), tr('Your past payments and receipts stay in My payments.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Remove'),
        style: 'destructive',
        onPress: async () => {
          try {
            await api('/client/vehicles/' + v.id, { method: 'DELETE' });
            setVid(null);
            vehicles.reload();
          } catch (e) {
            Alert.alert(tr('Could not remove'), errText(e));
          }
        },
      },
    ]);

  if (vehicles.error) return <Screen navigation={navigation}><LoadError error={vehicles.error} onRetry={vehicles.reload} /></Screen>;
  if (!vehicles.data) return <Screen navigation={navigation}><Loading /></Screen>;

  if (!list.length || adding)
    return (
      <Screen navigation={navigation}>
        <Body>
          {!cfg?.lookup ? <Note tone="orange">e-Challan lookup is not connected yet. It starts once the e-Challan provider is set up.</Note> : null}
          <T size={13.5} color={colors.text2} lh={20} raw>
            {tr('Add your vehicle to see its traffic challans. You pay Vakeel Bhai and we pay the department for you within {h} hours.', { h: hours })}
          </T>
          <AddVehicle
            onAdded={x => {
              setAdding(false);
              setVid(x.id);
              setTab('pending');
              vehicles.reload();
            }}
            onCancel={list.length ? () => setAdding(false) : undefined}
          />
        </Body>
      </Screen>
    );

  const VIcon = ICON[v.type] ?? Car;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="e-Challan" onBack={() => navigation.goBack()} right={<Tap onPress={() => setAdding(true)} hitSlop={8} style={{ paddingHorizontal: 8 }}><Plus size={22} color={colors.text} /></Tap>} />
      <View style={{ backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.ink2, alignItems: 'center', justifyContent: 'center' }}>
            <VIcon size={24} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 6, borderWidth: 2, borderColor: colors.gold, paddingHorizontal: 8, paddingVertical: 2 }}>
              <T w="extrabold" size={15} raw style={{ letterSpacing: 1 }}>
                {v.number}
              </T>
            </View>
            <T size={12} w="medium" color={colors.onInkMuted} style={{ marginTop: 6 }} raw>
              {tr(typeLabel(v.type)) + ' · ' + (list.indexOf(v) + 1) + '/' + list.length}
            </T>
          </View>
          {list.length > 1 ? (
            <Tap onPress={() => setVid(list[(list.indexOf(v) + 1) % list.length].id)} style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.inkBorder, justifyContent: 'center' }}>
              <T w="semibold" size={12} color={colors.white}>
                Change
              </T>
            </Tap>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {(['pending', 'orders'] as const).map(k => (
            <Tap key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
              <T w="semibold" size={14} color={tab === k ? colors.ink : colors.muted}>
                {k === 'pending' ? 'Challans' : 'My payments'}
              </T>
            </Tap>
          ))}
        </View>
      </View>

      <Body gap={10}>
        {tab === 'pending' ? (
          challans.error ? (
            <LoadError error={challans.error} onRetry={challans.reload} />
          ) : !challans.data ? (
            <Loading label={tr('Checking challans…')} />
          ) : challans.data.challans.length === 0 ? (
            <EmptyState icon={CircleCheck} title="No challans" sub="This vehicle has no pending challans." />
          ) : (
            challans.data.challans.map(c => {
              const on = sel.includes(c.id);
              const open = c.state === 'due';
              return (
                <Tap
                  key={c.id}
                  disabled={!open && !c.order}
                  onPress={() => (open ? setSel(on ? sel.filter(x => x !== c.id) : [...sel, c.id]) : c.order ? navigation.navigate('ChallanReceipt', { id: c.order }) : undefined)}
                  accessibilityRole={open ? 'checkbox' : 'button'}
                  accessibilityState={{ checked: on }}
                  style={{ backgroundColor: colors.white, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.ink : colors.line }}>
                  {open ? <CheckBox on={on} /> : <CircleCheck size={22} color={c.state === 'paid' ? colors.green : colors.orange} />}
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T w="bold" size={14} style={{ flex: 1 }} raw>
                        {c.offence}
                      </T>
                      <T w="bold" size={14} raw>
                        {inr(c.amount)}
                      </T>
                    </View>
                    <T size={12} w="medium" color={colors.muted} raw>
                      {c.place}
                    </T>
                    <T size={12} w="medium" color={colors.muted} raw>
                      {c.id + ' · ' + c.date}
                    </T>
                    {c.state === 'processing' ? (
                      <Pill label="Paid · we are paying the department" tone="orange" dot={false} />
                    ) : c.state === 'paid' ? (
                      <Pill label="Paid via Vakeel Bhai" tone="green" dot={false} />
                    ) : c.court ? (
                      <Pill label="Sent to court" tone="red" dot={false} />
                    ) : null}
                  </View>
                </Tap>
              );
            })
          )
        ) : orders.error ? (
          <LoadError error={orders.error} onRetry={orders.reload} />
        ) : !orders.data ? (
          <Loading />
        ) : orders.data.length === 0 ? (
          <EmptyState icon={Receipt} title="No challan payments yet" />
        ) : (
          orders.data.map(o => (
            <Card key={o.id} onPress={() => navigation.navigate('ChallanReceipt', { id: o.id })} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T w="bold" size={14} raw>
                  {o.vehicle.number + ' · ' + o.items.length + ' ' + tr(o.items.length === 1 ? 'challan' : 'challans')}
                </T>
                <T w="bold" size={14} raw>
                  {inr(o.amounts.total)}
                </T>
              </View>
              <T size={12} color={colors.muted} raw>
                {o.id + ' · ' + tr('paid') + ' ' + when(o.paidAt)}
              </T>
              {ORDER_PILL[o.status] ? <Pill label={ORDER_PILL[o.status].label} tone={ORDER_PILL[o.status].tone} /> : null}
            </Card>
          ))
        )}
        {tab === 'pending' ? (
          <Tap onPress={remove} hitSlop={8} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 8 }}>
            <Trash2 size={15} color={colors.muted} />
            <T size={12.5} w="semibold" color={colors.muted} raw>
              {tr('Remove') + ' ' + v.number}
            </T>
          </Tap>
        ) : null}
      </Body>

      {tab === 'pending' && due.length ? (
        <BottomBar>
          {chosen.length ? (
            <View style={{ gap: 4 }}>
              <BillRow label={tr('Challans') + ' (' + chosen.length + ')'} value={inr(sum)} raw />
              <BillRow label="Vakeel Bhai charge" value={cfg?.fee == null ? '—' : inr(charge)} />
              <BillRow label={tr('GST on charge') + ' (' + r2(gstRate * 100) + '%)'} value={cfg?.fee == null ? '—' : inr(gst)} raw />
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View>
              <T w="extrabold" size={19} raw>
                {inr(total)}
              </T>
              <T size={11.5} w="medium" color={colors.muted} raw>
                {tr('{a} of {b} selected', { a: chosen.length, b: due.length })}
              </T>
            </View>
            <Button title={paying ? 'Processing…' : 'Pay challans'} loading={paying} disabled={!chosen.length || cfg?.fee == null} onPress={checkout} style={{ flex: 1 }} />
          </View>
          {cfg?.fee == null ? (
            <Note tone="orange">e-Challan payments open soon.</Note>
          ) : (
            <Note tone="gold" icon={Clock}>
              {tr('You pay Vakeel Bhai now. We pay your challan to the traffic department within {h} hours and send you the receipt.', { h: hours })}
            </Note>
          )}
        </BottomBar>
      ) : null}
      {sheet}
    </View>
  );
}

function Screen({ navigation, children }: { navigation: any; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="e-Challan" onBack={() => navigation.goBack()} />
      {children}
    </View>
  );
}

/** After paying, and as the receipt (params.id = EC-… order). */
export function ChallanReceipt({ navigation, route }: P) {
  useLang();
  const id = route.params?.id;
  const { data: o, error, reload } = useApi<Order>('/client/challans/orders/' + id);
  useLive({ 'challan:update': p => p.number === id && reload() });
  if (error) return <Screen navigation={navigation}><LoadError error={error} onRetry={reload} /></Screen>;
  if (!o) return <Screen navigation={navigation}><Loading /></Screen>;
  const steps = [
    { title: 'Payment received', sub: when(o.paidAt), state: 'done' as const },
    {
      title: o.status === 'refunded' ? 'Could not be paid to the department' : 'Paying the traffic department',
      sub: o.status === 'processing' ? tr('Within {h} hours · by {t}', { h: o.payWithinHours, t: when(o.dueBy) }) : o.status === 'completed' ? tr('Paid') + ' ' + when(o.completedAt) : o.note ?? '',
      state: (o.status === 'processing' ? 'now' : 'done') as 'now' | 'done',
    },
    o.status === 'refunded'
      ? { title: 'Refunded in full', sub: tr('Back to your original payment method. It can take 5 to 7 working days to show.'), state: 'done' as const }
      : { title: 'Challan cleared', sub: o.departmentRef ? tr('Department receipt no.') + ' ' + o.departmentRef : tr('You get the department receipt here'), state: (o.status === 'completed' ? 'done' : 'todo') as 'done' | 'todo' },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="e-Challan receipt" sub={o.id} onBack={() => navigation.goBack()} />
      <Body>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
          <CircleCheck size={48} color={o.status === 'refunded' ? colors.orange : colors.green} />
          <T w="bold" size={18}>
            {o.status === 'completed' ? 'Challan paid' : o.status === 'refunded' ? 'Refunded' : 'Payment successful'}
          </T>
          <T w="extrabold" size={28} raw>
            {inr(o.amounts.total)}
          </T>
          <T size={12.5} color={colors.muted} raw>
            {o.vehicle.number}
          </T>
        </Card>
        {o.status === 'processing' ? (
          <Note tone="gold" icon={Clock}>
            {tr('Your e-Challan will be paid to the traffic department within {h} hours. We will notify you with the receipt.', { h: o.payWithinHours })}
          </Note>
        ) : null}
        <Card>
          <Timeline steps={steps.map(s => ({ ...s, title: tr(s.title) }))} />
        </Card>
        <Card style={{ gap: 10 }}>
          {o.items.map(c => (
            <View key={c.id} style={{ gap: 2 }}>
              <BillRow label={c.offence} value={inr(c.amount)} raw />
              <T size={12} color={colors.muted} raw>
                {c.id + ' · ' + c.date}
              </T>
            </View>
          ))}
          <Divider />
          <BillRow label="Vakeel Bhai charge" value={inr(o.amounts.fee)} />
          <BillRow label={tr('GST on charge') + ' (' + o.amounts.gstPercent + '%)'} value={inr(o.amounts.gst)} raw />
          <BillRow label="Total paid" value={inr(o.amounts.total)} strong />
        </Card>
        <Tap onPress={() => navigation.navigate('NewTicket', { topic: 'echallan', ref: o.id })} hitSlop={8}>
          <T w="semibold" size={12.5} color={colors.goldText} center>
            Need help with this payment? Contact support
          </T>
        </Tap>
      </Body>
      <BottomBar>
        <Button title="Done" onPress={() => navigation.popTo('Challan')} />
      </BottomBar>
    </View>
  );
}

/* ---------- GST filing ---------- */

type Gst = {
  id: string;
  returnType: string;
  gstin: string;
  businessName: string;
  period: string;
  note: string;
  docs: { id: string; name: string; at: string }[];
  status: 'requested' | 'in_review' | 'documents_needed' | 'filed' | 'closed';
  fee: { fee: number; gst: number; total: number; gstPercent: number } | null;
  paid: boolean;
  paidAt: string | null;
  filedRef: string | null;
  ticket: string | null;
  createdAt: string;
};
const GST_PILL: Record<string, { label: string; tone: any }> = {
  requested: { label: 'Requested', tone: 'neutral' },
  in_review: { label: 'In review', tone: 'blue' },
  documents_needed: { label: 'Documents needed', tone: 'orange' },
  filed: { label: 'Filed', tone: 'green' },
  closed: { label: 'Closed', tone: 'neutral' },
};

function GstShell({ navigation, children }: { navigation: any; children: React.ReactNode }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="GST filing" onBack={() => navigation.goBack()} />
      {children}
    </View>
  );
}

export function GstFiling({ navigation }: P) {
  const { meta } = useApp();
  useLang();
  const list = useApi<Gst[]>('/client/gst-filings');
  useLive({ 'gst:update': list.reload });
  const types: string[] = meta?.gstReturnTypes ?? ['GSTR-1', 'GSTR-3B'];
  const [type, setType] = useState('GSTR-3B');
  const [gstin, setGstin] = useState('');
  const [business, setBusiness] = useState('');
  const [period, setPeriod] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const isReg = type === 'New GST registration';
  const ok = isReg ? business.trim().length >= 2 : /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin) && period.trim().length >= 3;
  const submit = async () => {
    setBusy(true);
    try {
      const g = (await api('/client/gst-filings', { method: 'POST', body: { returnType: type, gstin: isReg ? '' : gstin, businessName: business.trim(), period: period.trim(), note: note.trim() } })).data;
      setGstin('');
      setPeriod('');
      setNote('');
      setBusiness('');
      navigation.navigate('GstDetail', { id: g.id });
    } catch (e) {
      Alert.alert(tr('Could not send'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="GST filing" onBack={() => navigation.goBack()} />
      <Body>
        <View style={{ backgroundColor: colors.goldTint, borderRadius: 14, padding: 16, gap: 6 }}>
          <T w="serif" size={20} color={colors.ink}>
            GST filing, handled
          </T>
          <T size={13} color="#4A3A12" lh={19}>
            Share your GSTIN and documents. Our team files your returns and you track every step here. The service fee is shown before we start.
          </T>
        </View>
        {list.data?.length ? (
          <View style={{ gap: 10 }}>
            <T w="bold" size={16}>
              Your requests
            </T>
            {list.data.map(g => (
              <Card key={g.id} onPress={() => navigation.navigate('GstDetail', { id: g.id })} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T w="bold" size={14} raw>
                    {g.id + ' · ' + g.returnType}
                  </T>
                  <Pill label={GST_PILL[g.status].label} tone={GST_PILL[g.status].tone} />
                </View>
                <T size={12.5} color={colors.muted} raw>
                  {(g.gstin || g.businessName) + (g.period ? ' · ' + g.period : '') + ' · ' + dateShort(ts(g.createdAt))}
                </T>
                {g.fee && !g.paid && g.status !== 'closed' ? <Pill label={tr('Pay') + ' ' + inr(g.fee.total)} tone="gold" dot={false} /> : null}
              </Card>
            ))}
          </View>
        ) : null}
        <T w="bold" size={16}>
          New request
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {types.map(r => (
            <Chip key={r} label={r} active={type === r} onPress={() => setType(r)} />
          ))}
        </View>
        {isReg ? (
          <Field label="Business name" value={business} onChangeText={setBusiness} maxLength={120} />
        ) : (
          <>
            <Field label="GSTIN" value={gstin} onChangeText={t => setGstin(t.toUpperCase().replace(/[^0-9A-Z]/g, ''))} placeholder="15-character GSTIN" maxLength={15} autoCapitalize="characters" />
            <Field label="Return period" value={period} onChangeText={setPeriod} placeholder="e.g. October 2026" maxLength={40} />
          </>
        )}
        <Field label="Anything we should know? (optional)" value={note} onChangeText={setNote} multiline maxLength={1000} />
        <T size={12} color={colors.muted}>
          You add your sales and purchase documents on the next screen.
        </T>
      </Body>
      <BottomBar>
        <Button title="Request GST filing" disabled={!ok} loading={busy} onPress={submit} />
      </BottomBar>
    </View>
  );
}

export function GstDetail({ navigation, route }: P) {
  useLang();
  const id: string = route.params?.id;
  const { data: g, error, reload } = useApi<Gst>('/client/gst-filings/' + id);
  const { pay, sheet } = usePay();
  const [busy, setBusy] = useState(false);
  useLive({ 'gst:update': p => p.number === id && reload() });
  if (error) return <GstShell navigation={navigation}><LoadError error={error} onRetry={reload} /></GstShell>;
  if (!g) return <GstShell navigation={navigation}><Loading /></GstShell>;
  const upload = async (uri: string | null) => {
    if (!uri) return;
    setBusy(true);
    try {
      await api('/client/gst-filings/' + id + '/documents', { method: 'POST', form: photoForm(uri) });
      reload();
    } catch (e) {
      Alert.alert(tr('Not uploaded'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  const add = () =>
    Alert.alert(tr('Add a document'), tr('Photograph a paper or pick an image'), [
      { text: tr('Camera'), onPress: async () => upload(await takePhoto()) },
      { text: tr('Gallery'), onPress: async () => upload(await choosePhoto()) },
      { text: tr('Cancel'), style: 'cancel' },
    ]);
  const payFee = async () => {
    setBusy(true);
    try {
      const co = (await api('/client/gst-filings/' + id + '/checkout', { method: 'POST' })).data;
      await pay(co);
      Alert.alert(tr('Paid'), tr('Our team starts the filing.'));
      reload();
    } catch (e: any) {
      if (e?.code !== 'CANCELLED') Alert.alert(tr('Payment not completed'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  const at = ['requested', 'in_review', 'documents_needed', 'filed', 'closed'].indexOf(g.status);
  const open = !['filed', 'closed'].includes(g.status);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={g.id + ' · ' + g.returnType} sub={(g.gstin || g.businessName) + (g.period ? ' · ' + g.period : '')} onBack={() => navigation.goBack()} right={<Pill label={GST_PILL[g.status].label} tone={GST_PILL[g.status].tone} />} />
      <Body>
        {g.status === 'documents_needed' ? <Note tone="orange">Our team needs more documents. Add them below or check the chat.</Note> : null}
        {g.fee && !g.paid && g.status !== 'closed' ? (
          <Card style={{ gap: 8, borderColor: colors.ink, borderWidth: 1.5 }}>
            <T w="bold" size={15}>
              Service fee
            </T>
            <BillRow label="GST filing fee" value={inr(g.fee.fee)} />
            <BillRow label={tr('GST') + ' ' + g.fee.gstPercent + '%'} value={inr(g.fee.gst)} raw />
            <Divider />
            <BillRow label="To pay" value={inr(g.fee.total)} strong />
            <Button title={tr('Pay') + ' ' + inr(g.fee.total)} loading={busy} onPress={payFee} />
          </Card>
        ) : null}
        {g.filedRef ? <Note>{tr('Filed. Acknowledgement number (ARN):') + ' ' + g.filedRef}</Note> : null}
        <Card>
          <Timeline
            steps={[
              { title: tr('Requested'), sub: dateShort(ts(g.createdAt)), state: 'done' },
              { title: tr('Team review and fee'), sub: g.fee ? inr(g.fee.total) + (g.paid ? ' · ' + tr('paid') : ' · ' + tr('to pay')) : tr('We tell you the fee here'), state: at >= 1 ? 'done' : 'now' },
              { title: tr('Documents'), sub: tr('{n} added', { n: g.docs.length }), state: g.status === 'documents_needed' ? 'now' : at >= 1 ? 'done' : 'todo' },
              { title: tr('Filed'), sub: g.filedRef ? 'ARN ' + g.filedRef : undefined, state: at >= 3 ? 'done' : g.paid ? 'now' : 'todo' },
            ]}
          />
        </Card>
        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <T w="bold" size={14} raw>
              {tr('Documents') + ' (' + g.docs.length + ')'}
            </T>
            {open ? <Button title="Add photo" icon={Upload} small variant="line" loading={busy} onPress={add} /> : null}
          </View>
          {g.docs.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {g.docs.map(d => (
                <SecureImage key={d.id} path={'/client/gst-filings/' + id + '/documents/' + d.id} fallback="image" style={{ width: 76, height: 76, borderRadius: 10 }} />
              ))}
            </View>
          ) : (
            <T size={13} color={colors.muted}>
              Add your sales and purchase invoices, bank statements or registration papers.
            </T>
          )}
        </Card>
        {g.ticket ? (
          <Card onPress={() => navigation.navigate('Ticket', { id: g.ticket })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <MessageCircle size={20} color={colors.goldText} />
            <T w="semibold" size={14} style={{ flex: 1 }}>
              Chat with our GST team
            </T>
            <T size={12} color={colors.muted} raw>
              {g.ticket}
            </T>
          </Card>
        ) : null}
      </Body>
      {sheet}
    </View>
  );
}
