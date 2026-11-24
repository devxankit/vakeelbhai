import React from 'react';
import {
  ActivityIndicator,
  Image,
  ImageSourcePropType,
  KeyboardTypeOptions,
  Pressable,
  PressableProps,
  ScrollView,
  StatusBar,
  StyleProp,
  StyleSheet,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { ArrowLeft, Check, ChevronRight, LucideIcon } from 'lucide-react-native';
import T from './T';
import { colors, font, radius } from '../theme';
import { tr, useLang } from '../i18n';

/* ---------- touch ---------- */

export function Tap({ style, children, ...rest }: PressableProps & { style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable
      android_ripple={{ color: 'rgba(0,0,0,0.06)', foreground: true }}
      style={({ pressed }) => [style, pressed && { opacity: 0.85 }]}
      {...rest}>
      {children}
    </Pressable>
  );
}

/* ---------- buttons ---------- */

type BtnVariant = 'gold' | 'ink' | 'line' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'gold',
  icon: Icon,
  disabled,
  loading,
  small,
  style,
}: {
  title: string;
  onPress?: () => void;
  variant?: BtnVariant;
  icon?: LucideIcon;
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const v = {
    gold: { bg: colors.gold, fg: colors.ink, border: colors.gold },
    ink: { bg: colors.ink, fg: colors.white, border: colors.ink },
    line: { bg: colors.white, fg: colors.text, border: colors.lineStrong },
    ghost: { bg: 'transparent', fg: colors.goldText, border: 'transparent' },
    danger: { bg: colors.white, fg: colors.red, border: '#F3C7C2' },
  }[variant];
  const off = disabled || loading;
  return (
    <Tap
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off }}
      disabled={off}
      onPress={onPress}
      style={[
        {
          height: small ? 40 : 48,
          borderRadius: radius.md,
          backgroundColor: off && variant !== 'ghost' ? colors.surface2 : v.bg,
          borderWidth: variant === 'line' || variant === 'danger' ? 1 : 0,
          borderColor: v.border,
          paddingHorizontal: small ? 12 : 16,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
        },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={colors.ink} />
      ) : (
        <>
          {Icon ? <Icon size={19} color={off ? colors.faint : v.fg} /> : null}
          <T w="bold" size={small ? 13.5 : 15} color={off ? colors.faint : v.fg} numberOfLines={1}>
            {title}
          </T>
        </>
      )}
    </Tap>
  );
}

/* ---------- layout ---------- */

/** Status bar icons: light on black headers, dark on white ones. Set on focus so tabs switch it correctly. */
export function useBarStyle(dark: boolean) {
  useFocusEffect(
    React.useCallback(() => {
      StatusBar.setBarStyle(dark ? 'light-content' : 'dark-content', true);
    }, [dark]),
  );
}

/** Black header block used by the premium screens (splash-like headers, dashboards). */
export function InkHeader({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const insets = useSafeAreaInsets();
  useBarStyle(true);
  return <View style={[{ backgroundColor: colors.ink, paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 14 }, style]}>{children}</View>;
}

export function AppBar({
  title,
  onBack,
  right,
  dark,
  sub,
}: {
  title?: string;
  onBack?: () => void;
  right?: React.ReactNode;
  dark?: boolean;
  sub?: string;
}) {
  const insets = useSafeAreaInsets();
  useBarStyle(!!dark);
  return (
    <View
      style={{
        paddingTop: insets.top + 2,
        paddingBottom: 4,
        minHeight: insets.top + 54,
        paddingLeft: onBack ? 6 : 16,
        paddingRight: 12,
        backgroundColor: dark ? colors.ink : colors.white,
        borderBottomWidth: dark ? 0 : 1,
        borderBottomColor: colors.line,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}>
      {onBack ? (
        <IconBtn icon={ArrowLeft} label="Back" onPress={onBack} color={dark ? colors.white : colors.text} />
      ) : null}
      <View style={{ flex: 1 }}>
        {title ? (
          <T w="bold" size={16} color={dark ? colors.white : colors.text} numberOfLines={1}>
            {title}
          </T>
        ) : null}
        {sub ? (
          <T size={12} w="medium" color={dark ? colors.onInkMuted : colors.muted} numberOfLines={1}>
            {sub}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function IconBtn({
  icon: Icon,
  label,
  onPress,
  color = colors.text,
  bordered,
  badge,
}: {
  icon: LucideIcon;
  label: string;
  onPress?: () => void;
  color?: string;
  bordered?: boolean | 'dark';
  badge?: boolean;
}) {
  useLang();
  return (
    <Tap
      accessibilityRole="button"
      accessibilityLabel={tr(label)}
      onPress={onPress}
      hitSlop={4}
      style={{
        width: 44,
        height: 44,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: bordered ? 1 : 0,
        borderColor: bordered === 'dark' ? colors.inkBorder : colors.line,
      }}>
      <Icon size={21} color={color} />
      {badge ? (
        <View
          style={{
            position: 'absolute',
            top: 10,
            right: 11,
            width: 9,
            height: 9,
            borderRadius: 5,
            backgroundColor: colors.gold,
            borderWidth: 2,
            borderColor: bordered === 'dark' ? colors.ink : colors.white,
          }}
        />
      ) : null}
    </Tap>
  );
}

/** Scrolling page body with the standard padding. */
export function Body({
  children,
  padded = true,
  gap = 12,
  style,
  bg = colors.bg,
}: {
  children: React.ReactNode;
  padded?: boolean;
  gap?: number;
  style?: StyleProp<ViewStyle>;
  bg?: string;
}) {
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={[{ paddingHorizontal: padded ? 14 : 0, paddingTop: padded ? 12 : 0, gap, paddingBottom: 24 }, style]}
      keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Sticky bottom action area (handles the gesture bar inset). */
export function BottomBar({ children, row }: { children: React.ReactNode; row?: boolean }) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={{
        backgroundColor: colors.white,
        borderTopWidth: 1,
        borderTopColor: colors.line,
        paddingHorizontal: 14,
        paddingTop: 10,
        paddingBottom: Math.max(insets.bottom, 10) + 2,
        flexDirection: row ? 'row' : 'column',
        alignItems: row ? 'center' : 'stretch',
        gap: row ? 12 : 8,
      }}>
      {children}
    </View>
  );
}

export function Card({ children, style, onPress }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void }) {
  const s: StyleProp<ViewStyle> = [
    { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12 },
    style,
  ];
  return onPress ? (
    <Tap onPress={onPress} style={s}>
      {children}
    </Tap>
  ) : (
    <View style={s}>{children}</View>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
      <T w="bold" size={15.5}>
        {title}
      </T>
      {action ? (
        <Tap onPress={onAction} hitSlop={10}>
          <T w="semibold" size={13} color={colors.goldText}>
            {action}
          </T>
        </Tap>
      ) : null}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: 1, backgroundColor: colors.line }, style]} />;
}

/* ---------- status ---------- */

export type Tone = 'neutral' | 'gold' | 'green' | 'orange' | 'red' | 'blue' | 'ink';

export const toneColors: Record<Tone, { bg: string; fg: string; dot: string }> = {
  neutral: { bg: colors.surface2, fg: '#4A4740', dot: colors.muted },
  gold: { bg: colors.goldTint, fg: colors.goldText, dot: colors.gold },
  green: { bg: colors.greenSoft, fg: colors.green, dot: colors.green },
  orange: { bg: colors.orangeSoft, fg: colors.orange, dot: colors.orange },
  red: { bg: colors.redSoft, fg: colors.red, dot: colors.red },
  blue: { bg: colors.blueSoft, fg: colors.blue, dot: colors.blue },
  ink: { bg: colors.ink, fg: colors.gold, dot: colors.gold },
};

export function Pill({ label, tone = 'neutral', dot = true }: { label: string; tone?: Tone; dot?: boolean }) {
  const c = toneColors[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: c.bg,
        borderRadius: 999,
        paddingHorizontal: 9,
        height: 22,
        alignSelf: 'flex-start',
      }}>
      {dot ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c.dot }} /> : null}
      <T w="semibold" size={11.5} color={c.fg} numberOfLines={1}>
        {label}
      </T>
    </View>
  );
}

export function Tag({ label, bg, fg }: { label: string; bg: string; fg: string }) {
  return (
    <View style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, alignSelf: 'flex-start' }}>
      <T w="semibold" size={11.5} color={fg}>
        {label}
      </T>
    </View>
  );
}

/* ---------- inputs ---------- */

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  prefix,
  multiline,
  keyboardType,
  maxLength,
  hint,
  autoFocus,
  big,
  autoCapitalize,
}: {
  label?: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  prefix?: string;
  multiline?: boolean;
  keyboardType?: KeyboardTypeOptions;
  maxLength?: number;
  hint?: string;
  autoFocus?: boolean;
  big?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
}) {
  useLang();
  const [focus, setFocus] = React.useState(false);
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <T w="semibold" size={12.5} color={colors.text2}>
          {label}
        </T>
      ) : null}
      <View
        style={{
          minHeight: multiline ? 104 : big ? 52 : 46,
          borderWidth: focus ? 1.5 : 1,
          borderColor: focus ? colors.ink : colors.lineStrong,
          borderRadius: radius.md,
          backgroundColor: colors.white,
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          overflow: 'hidden',
        }}>
        {prefix ? (
          <View style={{ paddingHorizontal: 14, borderRightWidth: 1, borderRightColor: colors.line, alignSelf: 'stretch', justifyContent: 'center' }}>
            <T w="bold" size={big ? 18 : 15}>
              {prefix}
            </T>
          </View>
        ) : null}
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder ? tr(placeholder) : undefined}
          placeholderTextColor={colors.faint}
          multiline={multiline}
          keyboardType={keyboardType}
          maxLength={maxLength}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize ?? (keyboardType === 'email-address' ? 'none' : undefined)}
          autoCorrect={keyboardType === 'email-address' ? false : undefined}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          accessibilityLabel={label ? tr(label) : placeholder ? tr(placeholder) : undefined}
          maxFontSizeMultiplier={1.3}
          style={{
            flex: 1,
            paddingHorizontal: 14,
            paddingVertical: multiline ? 12 : 0,
            fontFamily: big ? font.semibold : font.medium,
            fontSize: big ? 18 : 15,
            color: colors.text,
            textAlignVertical: multiline ? 'top' : 'center',
            minHeight: multiline ? 104 : undefined,
            letterSpacing: big ? 0.5 : 0,
          }}
        />
      </View>
      {hint ? (
        <T size={12} color={colors.muted}>
          {hint}
        </T>
      ) : null}
    </View>
  );
}

export function Chip({ label, active, onPress, raw }: { label: string; active?: boolean; onPress?: () => void; raw?: boolean }) {
  return (
    <Tap
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!active }}
      style={{
        height: 34,
        paddingHorizontal: 12,
        borderRadius: 999,
        justifyContent: 'center',
        backgroundColor: active ? colors.ink : colors.white,
        borderWidth: active ? 0 : 1,
        borderColor: colors.lineStrong,
      }}>
      <T w="semibold" size={13} color={active ? colors.white : colors.text} raw={raw}>
        {label}
      </T>
    </Tap>
  );
}

export function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  useLang();
  return (
    <Tap
      accessibilityRole="switch"
      accessibilityLabel={tr(label)}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: value ? colors.ink : colors.lineStrong, justifyContent: 'center' }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: colors.white,
          marginLeft: value ? 23 : 3,
        }}
      />
    </Tap>
  );
}

export function Radio({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        borderWidth: 2,
        borderColor: on ? colors.ink : '#B8B0A0',
        backgroundColor: colors.white,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {on ? <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: colors.gold }} /> : null}
    </View>
  );
}

export function CheckBox({ on }: { on: boolean }) {
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 6,
        borderWidth: on ? 0 : 1.5,
        borderColor: '#B8B0A0',
        backgroundColor: on ? colors.gold : colors.white,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      {on ? <Check size={14} color={colors.ink} strokeWidth={3} /> : null}
    </View>
  );
}

/* ---------- rows ---------- */

export function ListRow({
  icon: Icon,
  title,
  sub,
  onPress,
  right,
  danger,
}: {
  icon?: LucideIcon;
  title: string;
  sub?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <Tap onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, paddingHorizontal: 12 }}>
      {Icon ? (
        <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: danger ? colors.redSoft : colors.goldTint, alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={danger ? colors.red : colors.goldText} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T w="semibold" size={14} color={danger ? colors.red : colors.text}>
          {title}
        </T>
        {sub ? (
          <T size={12} color={colors.muted} style={{ marginTop: 2 }}>
            {sub}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <ChevronRight size={18} color={colors.muted} /> : null)}
    </Tap>
  );
}

export function BillRow({ label, value, strong, color, raw }: { label: string; value: string; strong?: boolean; color?: string; raw?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <T w={strong ? 'extrabold' : 'medium'} size={strong ? 15.5 : 13.5} color={color ?? (strong ? colors.ink : colors.text2)} style={{ flex: 1 }} raw={raw}>
        {label}
      </T>
      <T w={strong ? 'extrabold' : 'semibold'} size={strong ? 15.5 : 13.5} color={color ?? (strong ? colors.ink : colors.text2)} raw>
        {value}
      </T>
    </View>
  );
}

export function Avatar({ source, size = 40, ring }: { source?: ImageSourcePropType; size?: number; ring?: boolean }) {
  return (
    <Image
      source={source ?? require('../assets/images/client-ananya.jpg')}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring ? 2 : 0,
        borderColor: colors.gold,
        backgroundColor: colors.surface2,
      }}
    />
  );
}

export function EmptyState({ title, sub, action, onAction, icon: Icon }: { title: string; sub?: string; action?: string; onAction?: () => void; icon?: LucideIcon }) {
  return (
    <View style={{ alignItems: 'center', paddingVertical: 24, paddingHorizontal: 20, gap: 8 }}>
      {Icon ? (
        <View style={{ width: 64, height: 64, borderRadius: 18, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
          <Icon size={28} color={colors.gold} />
        </View>
      ) : null}
      <T w="bold" size={17} center>
        {title}
      </T>
      {sub ? (
        <T size={13.5} color={colors.muted} center lh={20}>
          {sub}
        </T>
      ) : null}
      {action ? <Button title={action} onPress={onAction} small style={{ marginTop: 6, alignSelf: 'center' }} /> : null}
    </View>
  );
}

/** Green / gold / grey note box. */
export function Note({ children, tone = 'green', icon: Icon }: { children: React.ReactNode; tone?: 'green' | 'gold' | 'orange' | 'neutral'; icon?: LucideIcon }) {
  const c = {
    green: { bg: colors.greenSoft, fg: colors.greenText },
    gold: { bg: colors.goldTint, fg: colors.goldText },
    orange: { bg: '#FDF3EA', fg: colors.orangeText },
    neutral: { bg: colors.surface2, fg: colors.text2 },
  }[tone];
  return (
    <View style={{ flexDirection: 'row', gap: 8, backgroundColor: c.bg, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 11, alignItems: 'flex-start' }}>
      {Icon ? <Icon size={16} color={c.fg} style={{ marginTop: 1 }} /> : null}
      <T size={12} lh={17} color={c.fg} w="medium" style={{ flex: 1 }}>
        {children}
      </T>
    </View>
  );
}

/** Vertical status timeline. */
export function Timeline({ steps }: { steps: { title: string; sub?: string; state: 'done' | 'now' | 'todo' }[] }) {
  return (
    <View>
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        return (
          <View key={s.title} style={{ flexDirection: 'row', gap: 12 }}>
            <View style={{ width: 24, alignItems: 'center' }}>
              <View
                style={[
                  styles.dot,
                  s.state === 'done' && { backgroundColor: colors.green },
                  s.state === 'now' && { backgroundColor: colors.gold, borderWidth: 4, borderColor: colors.goldTint },
                  s.state === 'todo' && { backgroundColor: colors.white, borderWidth: 2, borderColor: colors.lineStrong },
                ]}>
                {s.state === 'done' ? <Check size={13} color={colors.white} strokeWidth={3} /> : null}
              </View>
              {!last ? <View style={{ flex: 1, width: 2, minHeight: 10, backgroundColor: s.state === 'done' ? colors.green : colors.line }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: last ? 0 : 10 }}>
              <T w="bold" size={13.5} color={s.state === 'todo' ? colors.muted : colors.text}>
                {s.title}
              </T>
              {s.sub ? (
                <T size={12} w="medium" color={s.state === 'now' ? colors.orange : colors.muted} style={{ marginTop: 2 }}>
                  {s.sub}
                </T>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
