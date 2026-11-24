import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { BadgeCheck, Star } from 'lucide-react-native';
import T from './T';
import { Avatar, Tone } from './ui';
import { colors } from '../theme';
import { Advocate, ADVOCATES, PLANS } from '../data/catalog';
import { CaseStatus, ReqStatus, State } from '../store/AppStore';
import { dateShort } from '../utils/format';

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
  return (
    <Image
      source={dark ? IMG.wordmarkWhite : IMG.wordmarkInk}
      style={{ height, width: height * 4.84 }}
      resizeMode="contain"
      accessibilityLabel="Vakeel Bhai"
    />
  );
}

export function Emblem({ size = 120, opacity = 1 }: { size?: number; opacity?: number }) {
  return <Image source={IMG.emblem} style={{ width: size, height: size * 1.255, opacity }} resizeMode="contain" />;
}

export function VerifiedMark({ size = 16 }: { size?: number }) {
  return <BadgeCheck size={size} color={colors.green} />;
}

export function AdvocateRow({ a, right, sub }: { a: Advocate; right?: React.ReactNode; sub?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <Avatar source={a.photo} size={44} />
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <T w="bold" size={15} raw numberOfLines={1}>
            {a.name}
          </T>
          <VerifiedMark size={16} />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
          <Star size={12} color={colors.gold} fill={colors.gold} />
          <T size={12} w="medium" color={colors.muted} raw>
            {a.rating + ' (' + a.reviews + ') · ' + a.years + ' yrs · ' + a.district}
          </T>
        </View>
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
};

export const CASE_STATUS: Record<CaseStatus, { label: string; tone: Tone }> = {
  new: { label: 'New request', tone: 'gold' },
  accepted: { label: 'Send a quote', tone: 'blue' },
  quoted: { label: 'Quote sent', tone: 'gold' },
  paid: { label: 'Paid · in progress', tone: 'green' },
  done: { label: 'Awaiting confirmation', tone: 'orange' },
  completed: { label: 'Completed', tone: 'green' },
  declined: { label: 'Declined', tone: 'neutral' },
};

/* ---------- membership card ---------- */

function QR({ size = 52 }: { size?: number }) {
  // Decorative stand-in. The real card encodes a verification link.
  const cells = [
    '1101101', '1001001', '1011101', '0010100', '1110111', '1000101', '1101011',
  ];
  const c = size / 7;
  return (
    <View style={{ width: size + 8, height: size + 8, backgroundColor: colors.white, borderRadius: 6, padding: 4 }}>
      <Svg width={size} height={size}>
        {cells.flatMap((row, y) =>
          row.split('').map((v, x) => (v === '1' ? <Rect key={x + '-' + y} x={x * c} y={y * c} width={c} height={c} fill={colors.ink} /> : null)),
        )}
      </Svg>
    </View>
  );
}

export function MembershipCard({ adv, planName, preview }: { adv: State['advocate']; planName?: string; preview?: boolean }) {
  const m = adv.membership;
  const plan = PLANS.find(p => p.id === m?.planId);
  const name = (planName ?? plan?.name ?? 'Yearly').toUpperCase() + ' MEMBER';
  const practice = adv.practice.length ? adv.practice.map(p => p[0].toUpperCase() + p.slice(1)).join(' · ') : 'Practice areas';
  return (
    <View style={{ height: 214, borderRadius: 18, backgroundColor: colors.ink, padding: 18, overflow: 'hidden', justifyContent: 'space-between' }}>
      <View style={{ position: 'absolute', right: -34, top: -14, opacity: 0.09 }}>
        <Emblem size={196} />
      </View>
      <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 4, backgroundColor: colors.gold }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Wordmark height={22} />
        <View style={{ backgroundColor: colors.gold, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
          <T w="bold" size={10.5} color={colors.ink}>
            {preview ? 'PREVIEW' : name}
          </T>
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Image
          source={adv.photo ? { uri: adv.photo } : IMG.rohan}
          style={{ width: 62, height: 62, borderRadius: 12, borderWidth: 2, borderColor: colors.gold }}
        />
        <View style={{ flex: 1 }}>
          <T w="serif" size={18} color={colors.white} raw numberOfLines={1}>
            {'Adv. ' + (adv.name || 'Your name')}
          </T>
          <T size={12} w="medium" color={colors.onInkSoft} raw numberOfLines={1}>
            {practice + ' · ' + (adv.district || '')}
          </T>
        </View>
        <QR />
      </View>
      <View style={{ flexDirection: 'row', gap: 18 }}>
        <KV k="Enrolment no." v={adv.enrolment || '—'} />
        <KV k="Member ID" v={m?.memberId ?? 'After payment'} />
        <KV k="Valid till" v={m ? dateShort(m.end) : '—'} gold />
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

export const advocatePhoto = (id?: string) => ADVOCATES.find(a => a.id === id)?.photo;
