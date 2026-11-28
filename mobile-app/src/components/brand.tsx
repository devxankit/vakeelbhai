import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { BadgeCheck } from 'lucide-react-native';
import T from './T';
import { Tone } from './ui';
import { SecureImage } from './data';
import { colors } from '../theme';
import { categoryOf } from '../data/catalog';
import type { AdvocateMe, CaseStatus, ReqStatus } from '../store/AppStore';
import { dateShort } from '../utils/format';
import { tr } from '../i18n';

export const IMG = {
  wordmarkWhite: require('../assets/images/wordmark-white.png'),
  wordmarkInk: require('../assets/images/wordmark-ink.png'),
  emblem: require('../assets/images/emblem-gold.png'),
  ananya: require('../assets/images/client-ananya.jpg'),
  gurpreet: require('../assets/images/client-gurpreet.jpg'),
  rohan: require('../assets/images/adv-rohan.jpg'),
};

/** Script wordmark: white on black headers, ink on white. Source aspect is about 4.84:1. */
export function Wordmark({ height = 28, dark = true }: { height?: number; dark?: boolean }) {
  return <Image source={dark ? IMG.wordmarkWhite : IMG.wordmarkInk} style={{ height, width: height * 4.84 }} resizeMode="contain" accessibilityLabel="Vakeel Bhai" />;
}

export function Emblem({ size = 120, opacity = 1 }: { size?: number; opacity?: number }) {
  return <Image source={IMG.emblem} style={{ width: size, height: size * 1.255, opacity }} resizeMode="contain" />;
}

export function VerifiedMark({ size = 16 }: { size?: number }) {
  return <BadgeCheck size={size} color={colors.green} />;
}

/** What a client sees of their advocate (server advocateCard): never a phone number. */
export type AdvocateCard = { id: string; name: string; verified: boolean; years: number | null; practice: string[]; court: string; district: string; hasPhoto: boolean };

export function AdvocateRow({ a, photoPath, right, sub }: { a: AdvocateCard; photoPath: string | null; right?: React.ReactNode; sub?: string }) {
  const bits = [a.years != null ? a.years + ' ' + tr('yrs') : '', a.district].filter(Boolean).join(' · ');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <SecureImage path={a.hasPhoto ? photoPath : null} style={{ width: 44, height: 44, borderRadius: 22 }} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T w="bold" size={15} raw numberOfLines={1}>
            {a.name}
          </T>
          {a.verified ? <VerifiedMark size={16} /> : null}
        </View>
        <T size={12} w="medium" color={colors.muted} raw style={{ marginTop: 2 }}>
          {bits}
        </T>
        {sub ? (
          <T size={12} color={colors.muted} style={{ marginTop: 2 }}>
            {sub}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/* ---------- status labels ---------- */

export const REQ_STATUS: Record<ReqStatus, { label: string; tone: Tone }> = {
  submitted: { label: 'Finding advocate', tone: 'neutral' },
  assigned: { label: 'Advocate assigned', tone: 'blue' },
  quoted: { label: 'Quote received', tone: 'gold' },
  paid: { label: 'In progress', tone: 'green' },
  done: { label: 'Confirm completion', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  disputed: { label: 'Disputed', tone: 'red' },
  refunded: { label: 'Refunded', tone: 'neutral' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};

export const CASE_STATUS: Record<CaseStatus, { label: string; tone: Tone }> = {
  new: { label: 'New request', tone: 'gold' },
  accepted: { label: 'Send a quote', tone: 'blue' },
  quoted: { label: 'Quote sent', tone: 'gold' },
  paid: { label: 'Paid · in progress', tone: 'green' },
  done: { label: 'Awaiting confirmation', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
  disputed: { label: 'Disputed', tone: 'red' },
  refunded: { label: 'Refunded to client', tone: 'neutral' },
};

/* ---------- membership card ---------- */

function QR({ size = 52 }: { size?: number }) {
  // Decorative stand-in. The real card encodes a verification link.
  const cells = ['1101101', '1001001', '1011101', '0010100', '1110111', '1000101', '1101011'];
  const c = size / 7;
  return (
    <View style={{ width: size + 8, height: size + 8, backgroundColor: colors.white, borderRadius: 6, padding: 4 }}>
      <Svg width={size} height={size}>
        {cells.flatMap((row, y) => row.split('').map((v, x) => (v === '1' ? <Rect key={x + '-' + y} x={x * c} y={y * c} width={c} height={c} fill={colors.ink} /> : null)))}
      </Svg>
    </View>
  );
}

export function MembershipCard({ adv, planName, preview }: { adv: AdvocateMe; planName?: string; preview?: boolean }) {
  const m = adv.membership;
  const name = (planName ?? m?.planName ?? '').toUpperCase() + ' MEMBER';
  const practice = adv.practice.length ? adv.practice.map(p => tr(categoryOf(p).short)).join(' · ') : tr('Practice areas');
  return (
    <View style={{ height: 214, borderRadius: 18, backgroundColor: colors.ink, padding: 18, overflow: 'hidden', justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', right: -34, top: -14, opacity: 0.09 }}>
        <Emblem size={196} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, backgroundColor: colors.gold }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Wordmark height={22} />
        <View style={{ backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <T w="bold" size={10.5} color={colors.ink} raw>
            {preview ? tr('PREVIEW') : name}
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <SecureImage path={adv.hasPhoto ? '/advocate/photo' : null} style={{ width: 62, height: 62, borderRadius: 12, borderWidth: 2, borderColor: colors.gold }} />
        <View style={{ flex: 1 }}>
          <T w="serif" size={18} color={colors.white} raw numberOfLines={1}>
            {'Adv. ' + (adv.user.name || tr('Your name'))}
          </T>
          <T size={12} w="medium" color={colors.onInkSoft} raw numberOfLines={1}>
            {practice + ' · ' + (adv.district || '')}
          </T>
        </View>
        <QR />
      </View>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <KV k="Enrolment no." v={adv.enrolmentNumber || '—'} />
        <KV k="Member ID" v={m?.memberId ?? tr('After payment')} />
        <KV k="Valid till" v={m ? dateShort(new Date(m.endAt).getTime()) : '—'} gold />
      </View>
    </View>
  );
}

function KV({ k, v, gold }: { k: string; v: string; gold?: boolean }) {
  return (
    <View>
      <T size={10} w="medium" color="#8A857A">
        {k}
      </T>
      <T size={12} w="bold" color={gold ? colors.gold : colors.white} raw>
        {v}
      </T>
    </View>
  );
}
