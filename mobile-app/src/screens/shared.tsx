import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, Image, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronDown, ChevronUp, CircleHelp, FileText, Lock, MessageCircle, Paperclip, Send, ShieldCheck, Trash2, User } from 'lucide-react-native';
import T from '../components/T';
import { AppBar, Avatar, Body, Button, Card, Divider, EmptyState, IconBtn, ListRow, Note, Tap, Toggle } from '../components/ui';
import { IMG } from '../components/brand';
import { colors, font } from '../theme';
import { advocateById, AUTO_CONFIRM_DAYS, categoryOf, FAQS } from '../data/catalog';
import { Msg, useApp } from '../store/AppStore';
import { inr } from '../utils/money';
import { ago, dateShort, time } from '../utils/format';
import { choosePhoto, openWhatsApp } from '../utils/media';
import { resetTo } from './auth';
import { tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

/* ---------- chat ---------- */

export function Chat({ navigation, route }: P) {
  const { s, sendMessage } = useApp();
  useLang();
  const insets = useSafeAreaInsets();
  const chatId: string = route.params?.chatId;
  const isCase = chatId.startsWith('case:');
  const req = !isCase ? s.requests.find(r => r.id === chatId) : undefined;
  const kase = isCase ? s.cases.find(c => 'case:' + c.id === chatId) : undefined;
  const adv = advocateById(req?.advocateId);
  const msgs = s.chats[chatId] ?? [];
  const [text, setText] = useState('');
  const list = useRef<FlatList<Msg>>(null);
  const closed = req?.status === 'completed' || kase?.status === 'completed' || kase?.status === 'declined';

  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [msgs.length]);

  const title = isCase ? kase?.clientName ?? '' : adv?.name ?? tr('Your advocate');
  const sub = isCase ? (kase ? tr(categoryOf(kase.category).short) + ' · ' + kase.id : '') : adv ? adv.years + ' ' + tr('yrs') + ' · ★ ' + adv.rating : '';
  const photo = isCase ? (kase?.clientPhoto === 'gurpreet' ? IMG.gurpreet : kase?.clientPhoto === 'ananya' ? IMG.ananya : null) : adv?.photo;

  const send = () => {
    const t = text.trim();
    if (!t) return;
    sendMessage(chatId, { kind: 'text', text: t });
    setText('');
  };

  const render = ({ item: m }: { item: Msg }) => {
    if (m.from === 'system') {
      return (
        <View style={{ alignSelf: 'center', backgroundColor: '#E9E5DC', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginVertical: 6, maxWidth: '92%' }}>
          <T size={11.5} w="semibold" color="#5F5B53" center>
            {m.text}
          </T>
        </View>
      );
    }
    const mine = m.from === 'me';
    if (m.kind === 'quote' && m.quote) {
      const canPay = !isCase && req?.status === 'quoted';
      return (
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', width: 290, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 16, overflow: 'hidden', marginVertical: 4 }}>
          <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <T w="bold" size={13} color={colors.gold}>
              Fee quote
            </T>
            <T size={11} w="medium" color={colors.onInkMuted} raw>
              {tr('Valid till {d}', { d: dateShort(m.quote.validTill) })}
            </T>
          </View>
          <View style={{ padding: 14, gap: 10 }}>
            <T w="extrabold" size={26} raw>
              {inr(m.quote.fee)}
            </T>
            <T size={13} color={colors.text2} lh={19} raw>
              {m.quote.scope}
            </T>
            <View style={{ height: 1, backgroundColor: colors.line }} />
            {canPay ? (
              <Button title="Accept and pay" small onPress={() => navigation.navigate('Checkout', { id: req!.id })} />
            ) : (
              <T size={12} w="semibold" color={colors.muted}>
                {isCase
                  ? kase?.status === 'quoted'
                    ? 'Waiting for the client to pay'
                    : 'Paid by the client'
                  : req && ['paid', 'done', 'completed', 'disputed'].includes(req.status)
                    ? 'Paid'
                    : 'GST and offers shown at checkout'}
              </T>
            )}
          </View>
        </View>
      );
    }
    return (
      <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', marginVertical: 3 }}>
        <View
          style={{
            backgroundColor: mine ? colors.ink : colors.white,
            borderWidth: mine ? 0 : 1,
            borderColor: colors.line,
            borderRadius: 14,
            borderTopLeftRadius: mine ? 14 : 4,
            borderTopRightRadius: mine ? 4 : 14,
            paddingHorizontal: m.kind === 'image' ? 4 : 12,
            paddingVertical: m.kind === 'image' ? 4 : 9,
          }}>
          {m.kind === 'image' && m.uri ? <Image source={{ uri: m.uri }} style={{ width: 200, height: 200, borderRadius: 11 }} /> : null}
          {m.text ? (
            <T size={14} lh={20} color={mine ? colors.white : colors.text} raw>
              {m.text}
            </T>
          ) : null}
        </View>
        <T size={10.5} w="medium" color="#8A857A" style={{ marginTop: 3, alignSelf: mine ? 'flex-end' : 'flex-start' }} raw>
          {time(m.at) + (mine ? ' · ' + tr('Sent') : '')}
        </T>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBg }}>
      <AppBar
        onBack={() => navigation.goBack()}
        title={title}
        sub={sub}
        right={
          photo ? (
            <Tap onPress={() => (adv ? navigation.navigate('AdvocateProfile', { id: adv.id }) : undefined)} style={{ paddingRight: 4 }}>
              <Avatar source={photo} size={36} />
            </Tap>
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
              <User size={18} color="#4A4740" />
            </View>
          )
        }
      />
      <FlatList
        ref={list}
        data={msgs}
        keyExtractor={m => m.id}
        renderItem={render}
        contentContainerStyle={{ padding: 14, paddingBottom: 18 }}
        ListHeaderComponent={
          <View style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Lock size={13} color="#5F5B53" />
            <T size={11.5} w="medium" color="#5F5B53">
              Private chat. Phone numbers are never shared.
            </T>
          </View>
        }
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
      />
      {closed ? (
        <View style={{ backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, padding: 14, paddingBottom: Math.max(insets.bottom, 12) + 4 }}>
          <T size={13} w="medium" color={colors.muted} center>
            This case is closed. Contact support if you need help.
          </T>
        </View>
      ) : (
        <View style={{ backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 4, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <IconBtn
            icon={Paperclip}
            label="Attach a photo"
            onPress={async () => {
              const u = await choosePhoto();
              if (u) sendMessage(chatId, { kind: 'image', uri: u });
            }}
          />
          {isCase && kase?.status === 'accepted' ? (
            <IconBtn icon={FileText} label="Send quote" onPress={() => navigation.navigate('SendQuote', { id: kase.id })} />
          ) : null}
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder={tr('Type a message')}
            placeholderTextColor={colors.faint}
            multiline
            maxFontSizeMultiplier={1.3}
            accessibilityLabel={tr('Message')}
            style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 16, paddingVertical: 10, fontFamily: font.regular, fontSize: 14, color: colors.text, backgroundColor: colors.white }}
          />
          <Tap
            accessibilityLabel={tr('Send')}
            onPress={send}
            disabled={!text.trim()}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.ink : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
            <Send size={19} color={text.trim() ? colors.gold : colors.faint} />
          </Tap>
        </View>
      )}
    </View>
  );
}

/* ---------- notifications ---------- */

export function Notifications({ navigation }: P) {
  const { s, readNotices } = useApp();
  useLang();
  useEffect(() => {
    const t = setTimeout(readNotices, 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Notifications" onBack={() => navigation.goBack()} />
      <Body gap={10}>
        {s.notices.length === 0 ? (
          <EmptyState icon={Bell} title="No notifications yet" sub="Updates about your requests, payments and verification appear here." />
        ) : (
          s.notices.map(n => (
            <Card key={n.id} style={{ flexDirection: 'row', gap: 12, backgroundColor: n.read ? colors.white : colors.goldWash }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <T w="bold" size={14} raw>
                  {tr(n.title)}
                </T>
                <T size={13} color={colors.text2} lh={19} raw>
                  {tr(n.body)}
                </T>
                <T size={11.5} color={colors.muted} raw>
                  {ago(n.at)}
                </T>
              </View>
            </Card>
          ))
        )}
      </Body>
    </View>
  );
}

/* ---------- help ---------- */

const TOPICS = ['Payments', 'Membership', 'Services', 'Technical issue'];

export function Help({ navigation }: P) {
  const [open, setOpen] = useState<number | null>(0);
  useLang();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Help and support" onBack={() => navigation.goBack()} />
      <Body>
        <View style={{ backgroundColor: colors.ink, borderRadius: 16, padding: 16, gap: 12 }}>
          <T w="bold" size={16} color={colors.white}>
            Chat with us on WhatsApp
          </T>
          <T size={13} color={colors.onInkSoft}>
            Pick a topic and we'll reply as soon as we can.
          </T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {TOPICS.map(t => (
              <Tap key={t} onPress={() => openWhatsApp(t)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 38, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.green }}>
                <MessageCircle size={16} color={colors.white} />
                <T w="semibold" size={13} color={colors.white}>
                  {t}
                </T>
              </Tap>
            ))}
          </View>
        </View>
        <T w="bold" size={16}>
          Common questions
        </T>
        <Card style={{ padding: 0 }}>
          {FAQS.map((f, i) => (
            <View key={f.q}>
              {i ? <Divider /> : null}
              <Tap onPress={() => setOpen(open === i ? null : i)} style={{ padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <T w="semibold" size={14} style={{ flex: 1 }}>
                    {f.q}
                  </T>
                  {open === i ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
                </View>
                {open === i ? (
                  <T size={13} color={colors.text2} lh={20}>
                    {f.a}
                  </T>
                ) : null}
              </Tap>
            </View>
          ))}
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow icon={FileText} title="Terms of use" onPress={() => navigation.navigate('Legal', { doc: 'terms' })} />
          <Divider />
          <ListRow icon={ShieldCheck} title="Privacy policy" onPress={() => navigation.navigate('Legal', { doc: 'privacy' })} />
          <Divider />
          <ListRow icon={CircleHelp} title="Refund policy" onPress={() => navigation.navigate('Legal', { doc: 'refund' })} />
        </Card>
      </Body>
    </View>
  );
}

const LEGAL: Record<string, { title: string; body: string[] }> = {
  terms: {
    title: 'Terms of use',
    body: [
      'Vakeel Bhai is a technology platform that connects clients with independent, verified advocates. Vakeel Bhai is not a law firm and does not give legal advice.',
      'Advocates set their own fees. Payments are made through the app and held until the client confirms the work, or until ' + AUTO_CONFIRM_DAYS + ' days pass without a dispute.',
      'Vakeel Bhai keeps a platform commission from the advocate\'s fee, plus GST on it. Rates are shown in the app.',
      'The final terms will be provided by the client before launch.',
    ],
  },
  privacy: {
    title: 'Privacy policy',
    body: [
      'We collect your mobile number, name, city and the details you share in requests and chats, so we can connect you with an advocate.',
      'Advocate documents, including Aadhaar, are visible only to the Vakeel Bhai verification team.',
      'Phone numbers are never shared between clients and advocates.',
      'You can delete your account from Settings. The final policy will be provided by the client before launch.',
    ],
  },
  refund: {
    title: 'Refund policy',
    body: [
      'If the agreed work is not done, raise a dispute from the request screen before confirming. The payment stays on hold while our team reviews it.',
      'If the dispute is upheld, the amount is refunded to your original payment method.',
      'Membership fees are non-refundable once the membership is active. The final policy will be provided by the client before launch.',
    ],
  },
};

export function Legal({ navigation, route }: P) {
  const d = LEGAL[route.params?.doc ?? 'terms'];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={d.title} onBack={() => navigation.goBack()} />
      <Body gap={12}>
        <Note tone="gold">Draft text for the demo. The client provides the final version.</Note>
        {d.body.map(p => (
          <T key={p} size={14} color={colors.text2} lh={22}>
            {p}
          </T>
        ))}
      </Body>
    </View>
  );
}

/* ---------- settings ---------- */

export function Settings({ navigation }: P) {
  const { s, deleteAccount } = useApp();
  const [push, setPush] = useState(true);
  const [wa, setWa] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Settings" onBack={() => navigation.goBack()} />
      <Body>
        <Card style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T w="semibold" size={14} style={{ flex: 1 }}>
              Push notifications
            </T>
            <Toggle value={push} onChange={setPush} label="Push notifications" />
          </View>
          <Divider />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <T w="semibold" size={14} style={{ flex: 1 }}>
              Updates on WhatsApp
            </T>
            <Toggle value={wa} onChange={setWa} label="Updates on WhatsApp" />
          </View>
        </Card>
        <Card style={{ padding: 0 }}>
          <ListRow
            icon={Trash2}
            title="Delete my account"
            sub="Removes your profile and data from this phone"
            danger
            onPress={() =>
              Alert.alert(tr('Delete account?'), tr('This removes your profile, requests and wallet from this phone. It cannot be undone.'), [
                { text: tr('Cancel'), style: 'cancel' },
                {
                  text: tr('Delete'),
                  style: 'destructive',
                  onPress: () => {
                    deleteAccount();
                    resetTo(navigation, { name: 'Role' });
                  },
                },
              ])
            }
          />
        </Card>
        <T size={12} color={colors.faint} center raw>
          {'Vakeel Bhai 1.0.0 · ' + (s.role ?? '')}
        </T>
      </Body>
    </View>
  );
}
