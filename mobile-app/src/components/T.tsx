import React from 'react';
import { Text, TextProps } from 'react-native';
import { colors, font, FontWeight } from '../theme';
import { tr, useLang } from '../i18n';

type Props = TextProps & {
  w?: FontWeight;
  size?: number;
  color?: string;
  center?: boolean;
  lh?: number;
  /** Show exactly as given: names, numbers, what the user typed. */
  raw?: boolean;
};

function translate(children: React.ReactNode): React.ReactNode {
  if (typeof children === 'string') return tr(children);
  if (Array.isArray(children)) return children.map(c => (typeof c === 'string' ? tr(c) : c));
  return children;
}

/**
 * App text: Noto Sans with an explicit weight (Android picks fonts by file).
 * Indian scripts fall back to the system Noto families, which match it.
 * Font scaling is capped at 1.3x so layouts hold.
 */
export default function T({ w = 'regular', size = 14, color = colors.text, center, lh, style, raw, children, ...rest }: Props) {
  useLang();
  const oneLine = rest.numberOfLines === 1;
  return (
    <Text
      maxFontSizeMultiplier={1.3}
      adjustsFontSizeToFit={oneLine}
      minimumFontScale={oneLine ? 0.8 : undefined}
      {...rest}
      style={[
        { fontFamily: font[w], fontSize: size, color, includeFontPadding: false, textAlign: center ? 'center' : undefined, lineHeight: lh },
        style,
      ]}>
      {raw ? children : translate(children)}
    </Text>
  );
}
