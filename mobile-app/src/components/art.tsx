import React from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';
import { colors } from '../theme';

/**
 * Category tiles: the client's 3D icon set (assets/service_icons_3d, cropped from
 * "Legal Services Icon Grid.png") on a soft tinted rounded square.
 */
const ICONS: Record<string, any> = {
  criminal: require('../assets/images/cat3d-criminal.png'),
  civil: require('../assets/images/cat3d-civil.png'),
  matrimonial: require('../assets/images/cat3d-matrimonial.png'),
  accident: require('../assets/images/cat3d-accident.png'),
  consumer: require('../assets/images/cat3d-consumer.png'),
  notary: require('../assets/images/cat3d-notary.png'),
  other: require('../assets/images/cat3d-other.png'),
  challan: require('../assets/images/cat3d-challan.png'),
};

const TINT: Record<string, [string, string]> = {
  criminal: ['#FBF3EC', '#F3E4D6'],
  civil: ['#F1F6FB', '#E1EBF5'],
  matrimonial: ['#FCF1F2', '#F5DFE2'],
  accident: ['#EFF5FC', '#DDE9F7'],
  consumer: ['#FDF6E7', '#F7E8C6'],
  notary: ['#FBF6EC', '#F1E6CF'],
  other: ['#FBF6E6', '#F2E6C2'],
  challan: ['#F2F4F8', '#E2E7F0'],
};

export function CategoryArt({ k, size = 72, radius, plain }: { k: string; size?: number; radius?: number; plain?: boolean }) {
  const key = k in ICONS ? k : 'other';
  const [a, b] = TINT[key];
  const r = radius ?? Math.round(size * 0.24);
  const id = 'ct' + key;
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
      {!plain ? (
        <Svg width={size} height={size} style={{ position: 'absolute' }}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
              <Stop offset="0" stopColor={a} />
              <Stop offset="1" stopColor={b} />
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={size} height={size} fill={'url(#' + id + ')'} />
        </Svg>
      ) : null}
      <Image source={ICONS[key]} style={{ position: 'absolute', left: size * 0.1, top: size * 0.1, width: size * 0.8, height: size * 0.8 }} resizeMode="contain" />
    </View>
  );
}

/** Soft fade from ink to transparent, for text over photos (no hard edges). */
export function InkFade({ width, height, from = 0.42, to = 0.82, horizontal = true }: { width: number; height: number; from?: number; to?: number; horizontal?: boolean }) {
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        <LinearGradient id="fade" x1="0" y1="0" x2={horizontal ? '1' : '0'} y2={horizontal ? '0' : '1'}>
          <Stop offset="0" stopColor={colors.ink} stopOpacity={1} />
          <Stop offset={String(from)} stopColor={colors.ink} stopOpacity={0.96} />
          <Stop offset={String(to)} stopColor={colors.ink} stopOpacity={0.25} />
          <Stop offset="1" stopColor={colors.ink} stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={width} height={height} fill="url(#fade)" />
    </Svg>
  );
}

/** A 3D icon on black: a soft cream spotlight disc with a gold halo (banners, intro, offers). Only keys[0] is drawn. */
export function GlowArt({ keys, width, height }: { keys: string[]; width: number; height: number }) {
  const r = Math.min(width, height) * 0.46;
  const icon = r * 1.5;
  const cx = width / 2;
  const cy = height / 2;
  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height} style={{ position: 'absolute' }}>
        <Defs>
          <RadialGradient id="halo" cx="50%" cy="50%" r="50%">
            <Stop offset="0.6" stopColor={colors.gold} stopOpacity={0.35} />
            <Stop offset="1" stopColor={colors.gold} stopOpacity={0} />
          </RadialGradient>
          <RadialGradient id="disc" cx="50%" cy="42%" r="60%">
            <Stop offset="0" stopColor="#FFFDF7" />
            <Stop offset="1" stopColor="#F3E6C4" />
          </RadialGradient>
        </Defs>
        <Circle cx={cx} cy={cy} r={r * 1.28} fill="url(#halo)" />
        <Circle cx={cx} cy={cy} r={r} fill="url(#disc)" />
      </Svg>
      <Image source={ICONS[keys[0]] ?? ICONS.other} style={{ position: 'absolute', width: icon, height: icon, left: cx - icon / 2, top: cy - icon / 2 }} resizeMode="contain" />
    </View>
  );
}
