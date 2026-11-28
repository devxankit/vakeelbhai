import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, FlatList, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bell, ChevronDown, ChevronUp, CircleHelp, FileText, Headset, Lock, MessageCircle, Paperclip, Plus, Send, ShieldCheck, Trash2, User } from 'lucide-react-native';
import T from '../components/T';
import { AppBar, Body, BottomBar, Button, Card, Chip, Divider, EmptyState, Field, IconBtn, ListRow, Note, Pill, Tap, Toggle } from '../components/ui';
import { LoadError, Loading, SecureImage } from '../components/data';
import { colors, font } from '../theme';
import { Msg, useApp } from '../store/AppStore';
import { api, errText, photoForm } from '../api/client';
import { openInvoice } from './client';
import { useApi } from '../api/hooks';
import { useLive } from '../api/live';
import { inr } from '../utils/money';
import { ago, dateShort, time } from '../utils/format';
import { choosePhoto, openWhatsApp } from '../utils/media';
import { resetTo } from './auth';
import { tr, useLang } from '../i18n';

type P = { navigation: any; route: any };

const ts = (d?: string | null) => (d ? new Date(d).getTime() : 0);
const CHAT_OPEN = ['accepted', 'assigned', 'quoted', 'paid', 'done', 'disputed'];

/** Composer used by the request chat and the help desk. */
function Composer({ onText, onPhoto, extra, placeholder = 'Type a message', busy }: { onText: (t: string) => Promise<boolean>; onPhoto: (uri: string) => void; extra?: React.ReactNode; placeholder?: string; busy?: boolean }) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');
  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    if (await onText(t)) setText('');
  };
  return (
    <View style={{ backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, paddingHorizontal: 12, paddingTop: 10, paddingBottom: Math.max(insets.bottom, 10) + 4, flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
      <IconBtn
        icon={Paperclip}
        label="Attach a photo"
        onPress={async () => {
          const u = await choosePhoto();
          if (u) onPhoto(u);
        }}
      />
      {extra}
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder={tr(placeholder)}
        placeholderTextColor={colors.faint}
        multiline
        maxLength={2000}
        maxFontSizeMultiplier={1.3}
        accessibilityLabel={tr('Message')}
        style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 22, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 16, paddingVertical: 10, fontFamily: font.regular, fontSize: 14, color: colors.text, backgroundColor: colors.white }}
      />
      <Tap
        accessibilityLabel={tr('Send')}
        onPress={send}
        disabled={!text.trim() || busy}
        style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: text.trim() ? colors.ink : colors.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Send size={19} color={text.trim() ? colors.gold : colors.faint} />
      </Tap>
    </View>
  );
}

function SystemNote({ text }: { text: string }) {
  return (
    <View style={{ alignSelf: 'center', backgroundColor: '#E9E5DC', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5, marginVertical: 6, maxWidth: '92%' }}>
      <T size={11.5} w="semibold" color="#5F5B53" center raw>
        {text}
      </T>
    </View>
  );
}

function Bubble({ mine, text, imagePath, at, name }: { mine: boolean; text: string | null; imagePath: string | null; at: string; name?: string | null }) {
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%', marginVertical: 3 }}>
      {name ? (
        <T size={11} w="semibold" color={colors.goldText} style={{ marginBottom: 2 }} raw>
          {name}
        </T>
      ) : null}
      <View
        style={{
          backgroundColor: mine ? colors.ink : colors.white,
          borderWidth: mine ? 0 : 1,
          borderColor: colors.line,
          borderRadius: 14,
          borderTopLeftRadius: mine ? 14 : 4,
          borderTopRightRadius: mine ? 4 : 14,
          paddingHorizontal: imagePath ? 4 : 12,
          paddingVertical: imagePath ? 4 : 9,
        }}>
        {imagePath ? <SecureImage path={imagePath} fallback="image" style={{ width: 200, height: 200, borderRadius: 11 }} /> : null}
        {text ? (
          <T size={14} lh={20} color={mine ? colors.white : colors.text} raw>
            {text}
          </T>
        ) : null}
      </View>
      <T size={10.5} w="medium" color="#8A857A" style={{ marginTop: 3, alignSelf: mine ? 'flex-end' : 'flex-start' }} raw>
        {time(ts(at)) + (mine ? ' · ' + tr('Sent') : '')}
      </T>
    </View>
  );
}

/* ---------- request chat ---------- */

/** params: { id: request number, side: 'client' | 'advocate' } */
export function Chat({ navigation, route }: P) {
  useLang();
  const id: string = route.params?.id;
  const side: 'client' | 'advocate' = route.params?.side ?? 'client';
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Msg>>(null);
  const head = useApi<any>(side === 'client' ? '/client/requests/' + id : '/advocate/cases/' + id);
  const base = '/requests/' + id + '/messages';

  const load = useCallback(async () => {
    try {
      const j = await api(base);
      setMsgs(j.data);
      setStatus(j.meta?.status ?? '');
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  }, [base]);
  useEffect(() => {
    load();
  }, [load]);
  const add = (m: Msg) => setMsgs(l => (l && !l.some(x => x.id === m.id) ? [...l, m] : l));
  useLive({
    message: p => p.number === id && add(p.message),
    'request:update': p => {
      if (p.number !== id) return;
      load();
      head.reload();
    },
    reconnect: load,
  });
  useEffect(() => {
    const t = setTimeout(() => list.current?.scrollToEnd({ animated: true }), 120);
    return () => clearTimeout(t);
  }, [msgs?.length]);

  const h = head.data;
  const caseStatus = side === 'advocate' ? h?.status : null;
  const reqStatus = side === 'client' ? h?.status : null;
  const open = side === 'client' ? CHAT_OPEN.includes(reqStatus ?? status) : CHAT_OPEN.includes(caseStatus ?? '');
  const title = side === 'client' ? h?.advocate?.name ?? tr('Your advocate') : h?.clientName ?? '';
  const sub = side === 'client' ? (h?.advocate ? (h.advocate.years != null ? h.advocate.years + ' ' + tr('yrs') + ' · ' : '') + id : id) : id;

  const sendText = async (t: string) => {
    setBusy(true);
    try {
      add((await api(base, { method: 'POST', body: { text: t } })).data);
      return true;
    } catch (e) {
      Alert.alert(tr('Not sent'), errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const sendPhoto = async (uri: string) => {
    setBusy(true);
    try {
      add((await api(base + '/image', { method: 'POST', form: photoForm(uri) })).data);
    } catch (e) {
      Alert.alert(tr('Not sent'), errText(e));
    } finally {
      setBusy(false);
    }
  };

  const render = ({ item: m }: { item: Msg }) => {
    if (m.from === 'system') return <SystemNote text={m.text ?? ''} />;
    const mine = m.from === side;
    if (m.kind === 'quote' && m.quote) {
      const canPay = side === 'client' && reqStatus === 'quoted';
      return (
        <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', width: 290, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.ink, borderRadius: 16, overflow: 'hidden', marginVertical: 4 }}>
          <View style={{ backgroundColor: colors.ink, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
            <T w="bold" size={13} color={colors.gold}>
              Fee quote
            </T>
            <T size={11} w="medium" color={colors.onInkMuted} raw>
              {tr('Valid till {d}', { d: dateShort(ts(m.quote.validTill)) })}
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
              <Button title="Accept and pay" small onPress={() => navigation.navigate('Checkout', { id })} />
            ) : (
              <T size={12} w="semibold" color={colors.muted}>
                {side === 'advocate' ? (caseStatus === 'quoted' ? 'Waiting for the client to pay' : 'Paid by the client') : ['paid', 'done', 'completed', 'disputed'].includes(reqStatus ?? '') ? 'Paid' : 'GST shown at checkout'}
              </T>
            )}
          </View>
        </View>
      );
    }
    return <Bubble mine={mine} text={m.text} imagePath={m.kind === 'image' ? base + '/' + m.id + '/file' : null} at={m.at} />;
  };

  const photoPath = side === 'client' && h?.advocate?.hasPhoto ? '/client/requests/' + id + '/advocate/photo' : null;
  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBg }}>
      <AppBar
        onBack={() => navigation.goBack()}
        title={title}
        sub={sub}
        right={
          side === 'client' ? (
            <Tap onPress={() => navigation.navigate('AdvocateProfile', { id })} style={{ paddingRight: 4 }}>
              <SecureImage path={photoPath} style={{ width: 36, height: 36, borderRadius: 18 }} />
            </Tap>
          ) : (
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginRight: 4 }}>
              <User size={18} color="#4A4740" />
            </View>
          )
        }
      />
      {error && !msgs ? (
        <LoadError error={error} onRetry={load} />
      ) : !msgs ? (
        <Loading />
      ) : (
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
      )}
      {open ? (
        <Composer
          onText={sendText}
          onPhoto={sendPhoto}
          busy={busy}
          extra={side === 'advocate' && caseStatus === 'accepted' ? <IconBtn icon={FileText} label="Send quote" onPress={() => navigation.navigate('SendQuote', { id })} /> : null}
        />
      ) : h ? (
        <View style={{ backgroundColor: colors.white, borderTopWidth: 1, borderTopColor: colors.line, padding: 14 }}>
          <T size={13} w="medium" color={colors.muted} center>
            This case is closed. Contact support if you need help.
          </T>
        </View>
      ) : null}
    </View>
  );
}

/* ---------- notifications ---------- */

type Notice = { id: string; title: string; body: string; link: { kind: string; id: string | null } | null; read: boolean; at: string };

export function Notifications({ navigation }: P) {
  const { setUnread, user } = useApp();
  useLang();
  const list = useApi<Notice[]>('/notifications');
  useLive({ notification: list.reload });
  useEffect(() => {
    if (!list.data?.some(n => !n.read)) return;
    const t = setTimeout(() => {
      api('/notifications/read', { method: 'POST', body: {} })
        .then(j => setUnread(j.data.unread))
        .catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [list.data, setUnread]);

  const open = (n: Notice) => {
    const l = n.link;
    if (!l) return;
    if (l.kind === 'request' && l.id) navigation.navigate('RequestDetail', { id: l.id });
    else if (l.kind === 'case' && l.id) navigation.navigate('CaseDetail', { id: l.id });
    else if (l.kind === 'ticket' && l.id) navigation.navigate('Ticket', { id: l.id });
    else if (l.kind === 'challan' && l.id) navigation.navigate('ChallanReceipt', { id: l.id });
    else if (l.kind === 'gst' && l.id) navigation.navigate('GstDetail', { id: l.id });
    else if (l.kind === 'wallet') navigation.navigate(user?.role === 'advocate' ? 'AdvTabs' : 'ClientTabs', { screen: user?.role === 'advocate' ? 'AdvWallet' : 'Wallet' });
    else if (l.kind === 'membership') navigation.navigate('MembershipCard');
    else if (l.kind === 'verification') navigation.navigate('Splash');
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Notifications" onBack={() => navigation.goBack()} />
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={n => n.id}
          refreshing={list.loading}
          onRefresh={list.reload}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={<EmptyState icon={Bell} title="No notifications yet" sub="Updates about your requests, payments and verification appear here." />}
          renderItem={({ item: n }) => (
            <Card onPress={n.link ? () => open(n) : undefined} style={{ flexDirection: 'row', gap: 12, backgroundColor: n.read ? colors.white : colors.goldWash }}>
              <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={18} color={colors.gold} />
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <T w="bold" size={14} raw>
                  {n.title}
                </T>
                <T size={13} color={colors.text2} lh={19} raw>
                  {n.body}
                </T>
                <T size={11.5} color={colors.muted} raw>
                  {ago(ts(n.at))}
                </T>
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}

/* ---------- help desk ---------- */

const TOPICS: { key: string; label: string; client?: boolean }[] = [
  { key: 'payments', label: 'Payments' },
  { key: 'services', label: 'Legal services' },
  { key: 'membership', label: 'Membership' },
  { key: 'echallan', label: 'e-Challan', client: true },
  { key: 'gst', label: 'GST filing', client: true },
  { key: 'account', label: 'My account' },
  { key: 'technical', label: 'Technical issue' },
  { key: 'other', label: 'Something else' },
];
const topicLabel = (k: string) => TOPICS.find(t => t.key === k)?.label ?? k;
const TICKET: Record<string, { label: string; tone: any }> = { open: { label: 'Waiting for support', tone: 'orange' }, answered: { label: 'Support replied', tone: 'blue' }, closed: { label: 'Closed', tone: 'neutral' } };
type TicketRow = { id: string; topic: string; subject: string; ref: string | null; status: string; lastMessageAt: string; unread: boolean };

type Content = { faqs: { q: string; a: string; audience: string }[]; terms: LegalDoc; privacy: LegalDoc; refund: LegalDoc };
type LegalDoc = { title: string; body: string[]; draft: boolean };

export function Help({ navigation }: P) {
  const { meta, user } = useApp();
  const [open, setOpen] = useState<number | null>(null);
  useLang();
  const tickets = useApi<TicketRow[]>('/support/tickets');
  const content = useApi<Content>('/content');
  const faqs = (content.data?.faqs ?? []).filter(f => f.audience === 'all' || f.audience === user?.role);
  useLive({ 'support:update': tickets.reload });
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Help desk" onBack={() => navigation.goBack()} />
      <Body>
        <View style={{ backgroundColor: colors.ink, borderRadius: 16, padding: 16, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <Headset size={22} color={colors.gold} />
            <T w="bold" size={16} color={colors.white}>
              Talk to the Vakeel Bhai team
            </T>
          </View>
          <T size={13} color={colors.onInkSoft} lh={19}>
            Raise a ticket and chat with our support team here. We usually reply within a few hours.
          </T>
          <Button title="New ticket" icon={Plus} small onPress={() => navigation.navigate('NewTicket')} style={{ alignSelf: 'flex-start' }} />
        </View>

        {tickets.error ? (
          <LoadError error={tickets.error} onRetry={tickets.reload} />
        ) : !tickets.data ? (
          <Loading />
        ) : tickets.data.length ? (
          <View style={{ gap: 10 }}>
            <T w="bold" size={16}>
              Your tickets
            </T>
            {tickets.data.map(t => (
              <Card key={t.id} onPress={() => navigation.navigate('Ticket', { id: t.id })} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                {t.unread ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: colors.gold }} /> : null}
                <View style={{ flex: 1, gap: 3 }}>
                  <T w="bold" size={14} numberOfLines={1} raw>
                    {t.subject}
                  </T>
                  <T size={12} color={colors.muted} raw>
                    {t.id + ' · ' + tr(topicLabel(t.topic)) + ' · ' + ago(ts(t.lastMessageAt))}
                  </T>
                </View>
                <Pill label={TICKET[t.status].label} tone={TICKET[t.status].tone} dot={false} />
              </Card>
            ))}
          </View>
        ) : null}

        {meta?.supportWhatsApp ? (
          <Card onPress={() => openWhatsApp('General help', meta.supportWhatsApp)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: colors.greenSoft, alignItems: 'center', justifyContent: 'center' }}>
              <MessageCircle size={18} color={colors.green} />
            </View>
            <T w="semibold" size={14} style={{ flex: 1 }}>
              Prefer WhatsApp? Chat with us
            </T>
          </Card>
        ) : null}

        <T w="bold" size={16}>
          Common questions
        </T>
        <Card style={{ padding: 0 }}>
          {faqs.map((f, i) => (
            <View key={f.q}>
              {i ? <Divider /> : null}
              <Tap onPress={() => setOpen(open === i ? null : i)} style={{ padding: 14, gap: 8 }}>
                <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
                  <T w="semibold" size={14} style={{ flex: 1 }} raw>
                    {f.q}
                  </T>
                  {open === i ? <ChevronUp size={18} color={colors.muted} /> : <ChevronDown size={18} color={colors.muted} />}
                </View>
                {open === i ? (
                  <T size={13} color={colors.text2} lh={20} raw>
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

/** params (optional): { topic, ref } to start a ticket about a request, case or payment. */
export function NewTicket({ navigation, route }: P) {
  const { user } = useApp();
  useLang();
  const topics = TOPICS.filter(t => user?.role === 'client' || !t.client);
  const [topic, setTopic] = useState<string>(topics.some(t => t.key === route.params?.topic) ? route.params.topic : 'payments');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const ref: string | undefined = route.params?.ref;
  const ok = subject.trim().length >= 3 && message.trim().length >= 5;
  const send = async () => {
    setBusy(true);
    try {
      const t = (await api('/support/tickets', { method: 'POST', body: { topic, subject: subject.trim(), message: message.trim(), ...(ref ? { ref } : {}) } })).data;
      navigation.replace('Ticket', { id: t.id });
    } catch (e) {
      setBusy(false);
      Alert.alert(tr('Not sent'), errText(e));
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="Contact support" onBack={() => navigation.goBack()} />
      <Body>
        <T w="semibold" size={12.5} color={colors.text2}>
          Topic
        </T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {topics.map(t => (
            <Chip key={t.key} label={t.label} active={topic === t.key} onPress={() => setTopic(t.key)} />
          ))}
        </View>
        {ref ? <Note tone="neutral">{tr('About') + ' ' + ref}</Note> : null}
        <Field label="Subject" value={subject} onChangeText={setSubject} maxLength={120} placeholder="e.g. Payment not showing" />
        <Field label="Message" value={message} onChangeText={setMessage} multiline maxLength={2000} placeholder="Describe the problem. Add request or payment numbers if you have them." />
        <Note tone="neutral">Please don't share OTPs or bank passwords. Our team will never ask for them.</Note>
      </Body>
      <BottomBar>
        <Button title="Send to support" disabled={!ok} loading={busy} onPress={send} />
      </BottomBar>
    </View>
  );
}

type TicketMsg = { id: string; from: 'user' | 'support' | 'system'; name: string | null; kind: 'text' | 'image'; text: string | null; at: string };

export function Ticket({ navigation, route }: P) {
  useLang();
  const id: string = route.params?.id;
  const { data: t, error, reload } = useApi<TicketRow & { messages: TicketMsg[] }>('/support/tickets/' + id);
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<TicketMsg>>(null);
  useLive({ 'support:update': p => p.number === id && reload(), reconnect: reload });
  const path = '/support/tickets/' + id;
  const post = async (fn: () => Promise<any>) => {
    setBusy(true);
    try {
      await fn();
      reload();
      return true;
    } catch (e) {
      Alert.alert(tr('Not sent'), errText(e));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const close = () =>
    Alert.alert(tr('Close this ticket?'), tr('You can write again any time to reopen it.'), [
      { text: tr('Cancel'), style: 'cancel' },
      { text: tr('Close ticket'), onPress: () => api(path + '/close', { method: 'POST' }).then(reload).catch(e => Alert.alert(errText(e))) },
    ]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.chatBg }}>
      <AppBar
        title={t?.subject ?? id}
        sub={t ? t.id + ' · ' + tr(topicLabel(t.topic)) + (t.ref ? ' · ' + t.ref : '') : undefined}
        onBack={() => navigation.goBack()}
        right={t && t.status !== 'closed' ? <Tap onPress={close} hitSlop={8} style={{ paddingHorizontal: 6 }}><T w="semibold" size={12.5} color={colors.goldText}>Solved</T></Tap> : null}
      />
      {error ? (
        <LoadError error={error} onRetry={reload} />
      ) : !t ? (
        <Loading />
      ) : (
        <FlatList
          ref={list}
          data={t.messages}
          keyExtractor={m => m.id}
          contentContainerStyle={{ padding: 14, paddingBottom: 18 }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListHeaderComponent={
            <View style={{ alignSelf: 'center', marginBottom: 8 }}>
              <Pill label={TICKET[t.status].label} tone={TICKET[t.status].tone} />
            </View>
          }
          renderItem={({ item: m }) =>
            m.from === 'system' ? <SystemNote text={m.text ?? ''} /> : <Bubble mine={m.from === 'user'} name={m.from === 'support' ? m.name : null} text={m.text} imagePath={m.kind === 'image' ? path + '/messages/' + m.id + '/file' : null} at={m.at} />
          }
        />
      )}
      {t ? (
        <Composer
          busy={busy}
          placeholder={t.status === 'closed' ? 'Write to reopen this ticket' : 'Type a message'}
          onText={text => post(() => api(path + '/messages', { method: 'POST', body: { text } }))}
          onPhoto={uri => post(() => api(path + '/messages/image', { method: 'POST', form: photoForm(uri) }))}
        />
      ) : null}
    </View>
  );
}

/* ---------- legal ---------- */

export function Legal({ navigation, route }: P) {
  const content = useApi<Content>('/content');
  const key = ['terms', 'privacy', 'refund'].includes(route.params?.doc) ? route.params.doc : 'terms';
  const d: LegalDoc | undefined = content.data?.[key as 'terms'];
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title={d?.title ?? ''} onBack={() => navigation.goBack()} />
      {content.error ? (
        <LoadError error={content.error} onRetry={content.reload} />
      ) : !d ? (
        <Loading />
      ) : (
        <Body gap={12}>
          {d.draft ? <Note tone="gold">Draft text. The final version is provided before launch.</Note> : null}
          {d.body.map(p => (
            <T key={p} size={14} color={colors.text2} lh={22} raw>
              {p}
            </T>
          ))}
        </Body>
      )}
    </View>
  );
}

/* ---------- invoices ---------- */

const PURPOSE: Record<string, string> = { service: 'Legal service', membership: 'Membership', challan: 'e-Challan', gst: 'GST filing' };

export function Invoices({ navigation }: P) {
  useLang();
  const list = useApi<{ payment: string; invoiceNo: string; purpose: string; total: number; paidAt: string; status: string }[]>('/invoices');
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppBar title="My invoices" sub="A GST invoice for every payment" onBack={() => navigation.goBack()} />
      {list.error ? (
        <LoadError error={list.error} onRetry={list.reload} />
      ) : !list.data ? (
        <Loading />
      ) : (
        <FlatList
          data={list.data}
          keyExtractor={x => x.payment}
          contentContainerStyle={{ padding: 14, gap: 10 }}
          ListEmptyComponent={<EmptyState icon={FileText} title="No invoices yet" />}
          renderItem={({ item: x }) => (
            <Card onPress={() => openInvoice(x.payment)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <FileText size={20} color={colors.goldText} />
              <View style={{ flex: 1 }}>
                <T w="bold" size={14} raw>
                  {x.invoiceNo}
                </T>
                <T size={12} color={colors.muted} raw>
                  {tr(PURPOSE[x.purpose] ?? x.purpose) + ' · ' + dateShort(ts(x.paidAt)) + (x.status === 'refunded' ? ' · ' + tr('refunded') : '')}
                </T>
              </View>
              <T w="bold" size={14} raw>
                {inr(x.total)}
              </T>
            </Card>
          )}
        />
      )}
    </View>
  );
}

/* ---------- settings ---------- */

export function Settings({ navigation }: P) {
  const { user, deleteAccount } = useApp();
  const [push, setPush] = useState(true);
  const [wa, setWa] = useState(true);
  const remove = () =>
    Alert.alert(tr('Delete account?'), tr('This erases your name and email and logs you out everywhere. Payment and case records are kept as the law requires. It cannot be undone.'), [
      { text: tr('Cancel'), style: 'cancel' },
      {
        text: tr('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteAccount();
            resetTo(navigation, { name: 'Role' });
          } catch (e) {
            Alert.alert(tr('Could not delete the account'), errText(e));
          }
        },
      },
    ]);
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
          <ListRow icon={Trash2} title="Delete my account" sub="Erases your profile from Vakeel Bhai" danger onPress={remove} />
        </Card>
        <T size={12} color={colors.faint} center raw>
          {'Vakeel Bhai 1.0.0 · ' + (user?.role ?? '')}
        </T>
      </Body>
    </View>
  );
}
