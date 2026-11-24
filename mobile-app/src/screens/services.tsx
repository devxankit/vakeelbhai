import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { Car, CircleCheck, Download, Plus, Receipt, Upload } from 'lucide-react-native';
import T from '../components/T';
import { AppBar, BillRow, Body, BottomBar, Button, Card, CheckBox, Chip, Divider, EmptyState, Field, Note, Pill, Tap, useBarStyle } from '../components/ui';
import { colors } from '../theme';
import { CHALLANS } from '../data/catalog';
import { useApp } from '../store/AppStore';
import { inr } from '../utils/money';
import { dateShort } from '../utils/format';
import { choosePhoto } from '../utils/media';
import { tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

/* ---------- e-Challan ---------- */

export function Challan({ navigation }: P) {
  const { s, payChallans, addVehicle } = useApp();
  useLang();
  const vehicles = s.client.vehicles.length ? s.client.vehicles : [{ number: 'MP 09 AB 1234', model: 'Hyundai i20 · Petrol' }];
  const [vi, setVi] = useState(0);
  const v = vehicles[Math.min(vi, vehicles.length - 1)];
  const [tab, setTab] = useState<'pending' | 'paid'>('pending');
  const paidIds = s.client.paidChallans.map(p => p.id);
  const pending = CHALLANS.filter(c => c.vehicle === v.number && !paidIds.includes(c.id));
  const paid = s.client.paidChallans.filter(p => p.vehicle === v.number);
  const [sel, setSel] = useState<string[]>([]);
  const chosen = pending.filter(c => sel.includes(c.id));
  const total = chosen.reduce((a, c) => a + c.amount, 0);
  const [adding, setAdding] = useState(false);
  const [num, setNum] = useState('');
  const [paying, setPaying] = useState(false);

  const pay = () => {
    setPaying(true);
    setTimeout(() => {
      const receipt = payChallans(chosen.map(c => c.id));
      setPaying(false);
      setSel([]);
      navigation.navigate('ChallanReceipt', { receipt, ids: chosen.map(c => c.id), total });
    }, 1300);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="e-Challan" onBack={() => navigation.goBack()} />
      <View style={{ backgroundColor: colors.white, paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ backgroundColor: colors.ink, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: colors.ink2, alignItems: 'center', justifyContent: 'center' }}>
            <Car size={24} color={colors.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ alignSelf: 'flex-start', backgroundColor: colors.white, borderRadius: 6, borderWidth: 2, borderColor: colors.gold, paddingHorizontal: 8, paddingVertical: 2 }}>
              <T w="extrabold" size={15} raw style={{ letterSpacing: 1 }}>
                {v.number}
              </T>
            </View>
            <T size={12} w="medium" color={colors.onInkMuted} style={{ marginTop: 6 }} raw>
              {tr(v.model) + ' · ' + (vi + 1) + '/' + vehicles.length}
            </T>
          </View>
          {vehicles.length > 1 ? (
            <Tap onPress={() => { setVi((vi + 1) % vehicles.length); setSel([]); }} style={{ height: 36, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.inkBorder, justifyContent: 'center' }}>
              <T w="semibold" size={12} color={colors.white}>
                Change
              </T>
            </Tap>
          ) : null}
        </View>
        <View style={{ flexDirection: 'row', marginTop: 8 }}>
          {(['pending', 'paid'] as const).map(k => (
            <Tap key={k} onPress={() => setTab(k)} style={{ flex: 1, height: 46, alignItems: 'center', justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: tab === k ? colors.gold : 'transparent' }}>
              <T w="semibold" size={14} color={tab === k ? colors.ink : colors.muted} raw>
                {tr(k === 'pending' ? 'Pending' : 'Paid') + ' (' + (k === 'pending' ? pending.length : paid.length) + ')'}
              </T>
            </Tap>
          ))}
        </View>
      </View>

      <Body gap={10}>
        {tab === 'pending' ? (
          pending.length === 0 ? (
            <EmptyState icon={CircleCheck} title="No pending challans" sub="This vehicle has nothing to pay right now." />
          ) : (
            pending.map(c => {
              const on = sel.includes(c.id);
              return (
                <Tap
                  key={c.id}
                  onPress={() => setSel(on ? sel.filter(x => x !== c.id) : [...sel, c.id])}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  style={{ backgroundColor: colors.white, borderRadius: 14, padding: 14, flexDirection: 'row', gap: 12, borderWidth: on ? 1.5 : 1, borderColor: on ? colors.ink : colors.line }}>
                  <CheckBox on={on} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <T w="bold" size={14} style={{ flex: 1 }}>
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
                    <Pill label={c.due} tone={c.overdue ? 'red' : 'orange'} dot={false} />
                  </View>
                </Tap>
              );
            })
          )
        ) : paid.length === 0 ? (
          <EmptyState icon={Receipt} title="No paid challans yet" />
        ) : (
          paid.map(p => (
            <Card key={p.id + p.paidOn} style={{ gap: 4 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <T w="bold" size={14}>
                  {p.offence}
                </T>
                <T w="bold" size={14} raw>
                  {inr(p.amount)}
                </T>
              </View>
              <T size={12} w="medium" color={colors.muted} raw>
                {p.id + ' · ' + tr('paid') + ' ' + p.paidOn}
              </T>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <Pill label="Paid via Vakeel Bhai" tone="green" dot={false} />
                <Tap onPress={() => navigation.navigate('ChallanReceipt', { receipt: p.receipt, ids: [p.id], total: p.amount })} hitSlop={8}>
                  <T w="semibold" size={13} color={colors.goldText}>
                    Receipt
                  </T>
                </Tap>
              </View>
            </Card>
          ))
        )}

        {adding ? (
          <Card style={{ gap: 10 }}>
            <Field label="Vehicle number" value={num} onChangeText={t => setNum(t.toUpperCase())} placeholder="MP 09 AB 1234" maxLength={13} />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button
                title="Add vehicle"
                small
                style={{ flex: 1 }}
                disabled={num.replace(/\s/g, '').length < 8}
                onPress={() => {
                  addVehicle(num.trim());
                  setVi(vehicles.length);
                  setAdding(false);
                  setNum('');
                }}
              />
              <Button title="Cancel" small variant="line" onPress={() => setAdding(false)} />
            </View>
          </Card>
        ) : (
          <Button title="Add another vehicle" variant="line" icon={Plus} small onPress={() => setAdding(true)} />
        )}
        <T size={11.5} color={colors.muted} center lh={17}>
          Sample challans. Live data comes from the e-Challan provider chosen in the backend phase.
        </T>
      </Body>

      {tab === 'pending' && pending.length ? (
        <BottomBar row>
          <View>
            <T w="extrabold" size={19} raw>
              {inr(total)}
            </T>
            <T size={11.5} w="medium" color={colors.muted} raw>
              {tr('{a} of {b} selected', { a: chosen.length, b: pending.length })}
            </T>
          </View>
          <Button title={paying ? 'Processing…' : 'Pay challans'} loading={paying} disabled={!chosen.length} onPress={pay} style={{ flex: 1 }} />
        </BottomBar>
      ) : null}
    </View>
  );
}

export function ChallanReceipt({ navigation, route }: P) {
  const { receipt, ids = [], total = 0 } = route.params ?? {};
  useBarStyle(false);
  const items = CHALLANS.filter(c => ids.includes(c.id));
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Payment receipt" onBack={() => navigation.goBack()} />
      <Body>
        <Card style={{ alignItems: 'center', gap: 8, paddingVertical: 22 }}>
          <CircleCheck size={48} color={colors.green} />
          <T w="bold" size={18}>
            Challan payment successful
          </T>
          <T w="extrabold" size={28} raw>
            {inr(total)}
          </T>
          <T size={12.5} color={colors.muted} raw>
            {tr('Receipt') + ' ' + receipt + ' · ' + dateShort(Date.now())}
          </T>
        </Card>
        <Card style={{ gap: 10 }}>
          {items.map(c => (
            <View key={c.id} style={{ gap: 2 }}>
              <BillRow label={c.offence} value={inr(c.amount)} />
              <T size={12} color={colors.muted} raw>
                {c.id + ' · ' + c.vehicle}
              </T>
            </View>
          ))}
          <Divider />
          <BillRow label="Total paid" value={inr(total)} strong />
        </Card>
        <Note tone="gold">Demo build: no real payment was made. The receipt PDF comes from the provider in the backend phase.</Note>
      </Body>
      <BottomBar>
        <Button title="Download receipt" variant="line" icon={Download} onPress={() => Alert.alert(tr('Receipt'), tr('PDF receipts are available once the payment provider is connected.'))} />
        <Button title="Done" onPress={() => navigation.popTo('Challan')} />
      </BottomBar>
    </View>
  );
}

/* ---------- GST filing ---------- */

const RETURNS = ['GSTR-1', 'GSTR-3B', 'GSTR-9 (annual)', 'New GST registration'];
const STATUS_TONE: Record<string, any> = { Requested: 'neutral', 'In review': 'blue', 'Documents needed': 'orange', Filed: 'green' };

export function GstFiling({ navigation }: P) {
  const { s, requestGst } = useApp();
  useLang();
  const [gstin, setGstin] = useState('');
  const [type, setType] = useState(RETURNS[1]);
  const [period, setPeriod] = useState('October 2026');
  const [note, setNote] = useState('');
  const [docs, setDocs] = useState(0);
  const isReg = type === 'New GST registration';
  const ok = (isReg || /^[0-9A-Z]{15}$/.test(gstin)) && period.length > 2;
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

        {s.client.gst.length ? (
          <View style={{ gap: 10 }}>
            <T w="bold" size={16}>
              Your requests
            </T>
            {s.client.gst.map(g => (
              <Card key={g.id} style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <T w="bold" size={14} raw>
                    {g.id + ' · ' + g.returnType}
                  </T>
                  <Pill label={g.status} tone={STATUS_TONE[g.status]} />
                </View>
                <T size={12.5} color={colors.muted} raw>
                  {(g.gstin || tr('New registration')) + ' · ' + g.period + ' · ' + dateShort(g.at)}
                </T>
              </Card>
            ))}
          </View>
        ) : null}

        <T w="bold" size={16}>
          New request
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RETURNS.map(r => (
            <Chip key={r} label={r} active={type === r} onPress={() => setType(r)} />
          ))}
        </View>
        {!isReg ? <Field label="GSTIN" value={gstin} onChangeText={t => setGstin(t.toUpperCase().replace(/[^0-9A-Z]/g, ''))} placeholder="15-character GSTIN" maxLength={15} /> : null}
        <Field label={isReg ? 'Business name' : 'Return period'} value={period} onChangeText={setPeriod} />
        <Field label="Anything we should know? (optional)" value={note} onChangeText={setNote} multiline />
        <Button
          title={docs ? tr('{n} documents added', { n: docs }) : 'Add sales and purchase documents'}
          variant="line"
          icon={Upload}
          onPress={async () => {
            const u = await choosePhoto();
            if (u) setDocs(d => d + 1);
          }}
        />
      </Body>
      <BottomBar>
        <Button
          title="Request GST filing"
          disabled={!ok}
          onPress={() => {
            requestGst({ gstin: isReg ? '' : gstin, returnType: type, period, note });
            setGstin('');
            setNote('');
            setDocs(0);
            Alert.alert(tr('Request sent'), tr('Our team will review it and reply in the app. You can track the status on this screen.'));
          }}
        />
      </BottomBar>
    </View>
  );
}
