/**
 * Vakeel Bhai design tokens, copied from the approved design canvas (v0.1, 18 Nov 2026).
 * Black is the premium layer (splash, headers, membership card, wallet card),
 * gold means "act" (always with black text on it), working screens are white.
 * Green = verified / paid, red = rejected / disputed. Nothing decorative.
 */
export const colors = {
  ink: '#0E0E0E',
  ink2: '#1C1B19',
  inkLine: '#2E2C28',
  inkBorder: '#3A3833',
  onInkMuted: '#A8A397',
  onInkSoft: '#C9C4B8',

  gold: '#DDA62B',
  goldText: '#7A5A0E',
  goldTint: '#FBF1D6',
  goldWash: '#FFFBF0',

  text: '#141413',
  text2: '#3D3A34',
  muted: '#6E6A61',
  faint: '#A39E93',

  bg: '#FAF8F3',
  chatBg: '#F3F0E8',
  surface: '#FFFFFF',
  surface2: '#EFEDE8',
  line: '#ECE7DC',
  lineSoft: '#F1EDE4',
  lineStrong: '#D9D2C3',

  green: '#1E7B4F',
  greenSoft: '#E6F2EC',
  greenText: '#17603D',
  orange: '#B54708',
  orangeSoft: '#FBEEE2',
  orangeText: '#7A3304',
  blue: '#2F5D8C',
  blueSoft: '#E7EEF5',
  red: '#B42318',
  redSoft: '#FDECEA',
  white: '#FFFFFF',
};

/** Muted accent per service category: label tint (bg) and text colour (fg). */
export const categoryTone: Record<string, { bg: string; fg: string }> = {
  criminal: { bg: '#F6E8E6', fg: '#8C2F2F' },
  civil: { bg: '#E7EEF5', fg: '#2F5D8C' },
  matrimonial: { bg: '#F4E8F0', fg: '#8C3F72' },
  accident: { bg: '#FBEEE2', fg: '#B54708' },
  consumer: { bg: '#E6F2EC', fg: '#2F7A5D' },
  notary: { bg: '#ECE9F5', fg: '#5B4A8C' },
  other: { bg: '#EFEDE8', fg: '#4A4740' },
};

export const font = {
  regular: 'NotoSans-Regular',
  medium: 'NotoSans-Medium',
  semibold: 'NotoSans-SemiBold',
  bold: 'NotoSans-Bold',
  extrabold: 'NotoSans-ExtraBold',
  serif: 'NotoSerif-Bold',
};

export type FontWeight = keyof typeof font;

export const radius = { sm: 8, md: 12, lg: 14, xl: 18, pill: 999 };

/** Android hardware elevation only (CSS box shadows draw in software and drop frames). */
export const shadow = {
  card: { elevation: 1, shadowColor: '#0E0E0E' },
  raised: { elevation: 6, shadowColor: '#0E0E0E' },
  sheet: { elevation: 16, shadowColor: '#0E0E0E' },
};
