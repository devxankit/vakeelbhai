import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Image, Pressable, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ArrowRight, Globe, Lock, ShieldCheck } from 'lucide-react-native';
import T from '../components/T';
import { Body, BottomBar, Button, Field, IconBtn, InkHeader, Radio, Tap, useBarStyle } from '../components/ui';
import { Emblem, IMG, Wordmark } from '../components/brand';
import { GlowArt } from '../components/art';
import ServerSwitch from '../components/ServerSwitch';
import { colors, font } from '../theme';
import { useApp, Role } from '../store/AppStore';
import { startRoute } from '../navigation/routes';
import { LANGS, LangCode, tr, useLang } from '../i18n';
import { phonePretty } from '../utils/format';
import { errText, sendOtp } from '../api/client';

type P = { navigation: any; route: any };

export function resetTo(nav: any, r: { name: string; params?: object }) {
  nav.reset({ index: 0, routes: [r] });
}

/* ---------- Splash ---------- */

export function Splash({ navigation }: P) {
  const { prefs, me, ready } = useApp();
  useBarStyle(true);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, { toValue: 1, duration: 1100, useNativeDriver: false }).start();
  }, [progress]);
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => resetTo(navigation, startRoute({ prefs, me })), 900);
    return () => clearTimeout(t);
    // Route once, with the preferences from the device and the profile from the server.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center' }}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 22 }}>
        <Emblem size={168} />
        <View style={{ alignItems: 'center', gap: 8 }}>
          <T w="bold" size={15} color={colors.white}>
            India's trusted legal platform
          </T>
          <T size={13} color={colors.onInkMuted}>
            Verified advocates · e-Challan · GST filing
          </T>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: 16, paddingBottom: 56 }}>
        <View style={{ width: 120, height: 3, borderRadius: 3, backgroundColor: '#2A2925', overflow: 'hidden' }}>
          <Animated.View
            style={{ height: 3, backgroundColor: colors.gold, width: progress.interpolate({ inputRange: [0, 1], outputRange: [0, 120] }) }}
          />
        </View>
        <T size={12} w="medium" color="#8A857A">
          Advocates and clients, one trusted network
        </T>
      </View>
    </View>
  );
}

/* ---------- Language ---------- */

export function Language({ navigation, route }: P) {
  const { prefs, chooseLang } = useApp();
  useLang();
  const changing = route.params?.change;
  const [pick, setPick] = useState<LangCode>(prefs.lang);
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ paddingBottom: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
          {changing ? <IconBtn icon={ArrowLeft} label="Back" color={colors.white} onPress={() => navigation.goBack()} /> : <Wordmark height={28} />}
          <Globe size={22} color={colors.gold} />
        </View>
        <T w="serif" size={23} color={colors.white} style={{ marginTop: 12 }}>
          Choose your language
        </T>
        <T size={14} color={colors.onInkMuted} style={{ marginTop: 6 }} raw>
          भाषा चुनें · Choose your language
        </T>
      </InkHeader>
      <Body gap={10}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {LANGS.map(l => {
            const on = pick === l.code;
            return (
              <Tap
                key={l.code}
                onPress={() => setPick(l.code)}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={{
                  width: '48%',
                  flexGrow: 1,
                  height: 76,
                  borderRadius: 14,
                  paddingHorizontal: 14,
                  backgroundColor: on ? colors.goldTint : colors.white,
                  borderWidth: on ? 2 : 1,
                  borderColor: on ? colors.ink : colors.line,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                }}>
                <View style={{ flex: 1 }}>
                  <T w="bold" size={18} raw>
                    {l.native}
                  </T>
                  <T size={12} color={colors.muted} raw>
                    {l.name}
                  </T>
                </View>
                <Radio on={on} />
              </Tap>
            );
          })}
        </View>
        <T size={12} color={colors.muted} center style={{ marginTop: 6 }}>
          Translations are a draft and will be reviewed before launch.
        </T>
      </Body>
      <BottomBar>
        <Button
          title="Continue"
          icon={ArrowRight}
          onPress={() => {
            chooseLang(pick);
            if (changing) navigation.goBack();
            else navigation.replace('Intro');
          }}
        />
      </BottomBar>
    </View>
  );
}

/* ---------- Intro ---------- */

const SLIDES = [
  { art: ['other', 'criminal', 'civil'], title: 'Legal help from a verified advocate', body: 'Tell us your problem. Our team assigns an advocate from your district whose Bar Council documents we have checked.' },
  { art: ['consumer', 'notary'], title: 'Pay safely, only when the work is done', body: 'Agree on the fee in a private chat. Your payment is held by Vakeel Bhai and released only after you confirm.' },
  { art: ['challan', 'accident'], title: 'e-Challan and GST filing too', body: 'Check and pay traffic challans, and let our team file your GST returns, all in one app.' },
];

export function Intro({ navigation }: P) {
  const { seeIntro } = useApp();
  useBarStyle(true);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const [i, setI] = useState(0);
  const slide = SLIDES[i];
  const done = () => {
    seeIntro();
    navigation.replace('Role');
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View style={{ width, height: height * 0.48, paddingTop: insets.top + 24, alignItems: 'center', justifyContent: 'center' }}>
        <GlowArt keys={slide.art} width={Math.min(width - 40, 340)} height={height * 0.48 - insets.top - 40} />
      </View>
      <View style={{ position: 'absolute', top: insets.top + 8, right: 16 }}>
        <Tap onPress={done} style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: 'rgba(14,14,14,0.6)' }}>
          <T w="semibold" size={13} color={colors.white}>
            Skip
          </T>
        </Tap>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 22, paddingTop: 18, gap: 10, borderTopLeftRadius: 24, borderTopRightRadius: 24, backgroundColor: colors.ink2 }}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
          {SLIDES.map((_, k) => (
            <View key={k} style={{ height: 6, width: k === i ? 22 : 6, borderRadius: 3, backgroundColor: k === i ? colors.gold : '#3A3833' }} />
          ))}
        </View>
        <T w="serif" size={23} color={colors.white} lh={30}>
          {slide.title}
        </T>
        <T size={14} color={colors.onInkSoft} lh={21}>
          {slide.body}
        </T>
        <View style={{ flex: 1 }} />
        <View style={{ paddingBottom: insets.bottom + 8 }}>
          <Button title={i < SLIDES.length - 1 ? 'Next' : 'Get started'} icon={ArrowRight} onPress={() => (i < SLIDES.length - 1 ? setI(i + 1) : done())} />
        </View>
      </View>
    </View>
  );
}

/* ---------- Role ---------- */

export function RoleSelect({ navigation }: P) {
  const { prefs, chooseRole } = useApp();
  useLang();
  const [role, setRole] = useState<Role>(prefs.role ?? 'client');
  const card = (r: Role, img: any, title: string, sub: string) => {
    const on = role === r;
    return (
      <Tap
        onPress={() => setRole(r)}
        accessibilityRole="radio"
        accessibilityState={{ selected: on }}
        style={{
          borderRadius: 16,
          padding: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          backgroundColor: on ? colors.goldTint : colors.white,
          borderWidth: on ? 2 : 1,
          borderColor: on ? colors.ink : colors.line,
        }}>
        <Image source={img} style={{ width: 60, height: 60, borderRadius: 14 }} />
        <View style={{ flex: 1, gap: 6 }}>
          <T w="bold" size={17}>
            {title}
          </T>
          <T size={13} color="#5F5B53" lh={19}>
            {sub}
          </T>
        </View>
        <Radio on={on} />
      </Tap>
    );
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          <ServerSwitch>
            <Wordmark height={30} />
          </ServerSwitch>
          <Tap
            onPress={() => navigation.navigate('Language', { change: true })}
            style={{ height: 34, borderRadius: 999, borderWidth: 1, borderColor: colors.inkBorder, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Globe size={15} color="#E9E5DC" />
            <T w="semibold" size={12} color="#E9E5DC" raw>
              {LANGS.find(l => l.code === prefs.lang)?.native}
            </T>
          </Tap>
        </View>
        <T w="serif" size={24} color={colors.white} style={{ marginTop: 12 }}>
          Who are you?
        </T>
        <T size={14} color={colors.onInkMuted} style={{ marginTop: 6 }}>
          Choose how you want to use Vakeel Bhai
        </T>
      </InkHeader>
      <Body gap={14} style={{ paddingTop: 24, paddingHorizontal: 20 }}>
        {card('client', IMG.ananya, 'I am a Client', 'Get help from a verified advocate, pay e-Challans and file GST')}
        {card('advocate', IMG.rohan, 'I am an Advocate', 'Get verified, receive client cases in your district and earn')}
        <View style={{ gap: 8, marginTop: 10, paddingHorizontal: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <ShieldCheck size={16} color={colors.green} />
            <T size={12.5} w="medium" color="#5F5B53">
              Every advocate is checked by our team
            </T>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Lock size={16} color={colors.green} />
            <T size={12.5} w="medium" color="#5F5B53">
              Private chat, phone numbers never shared
            </T>
          </View>
        </View>
      </Body>
      <BottomBar>
        <Button
          title={role === 'client' ? 'Continue as Client' : 'Continue as Advocate'}
          icon={ArrowRight}
          onPress={() => {
            chooseRole(role);
            navigation.navigate('Login');
          }}
        />
      </BottomBar>
    </View>
  );
}

/* ---------- Login ---------- */

const validPhone = (p: string) => /^[6-9]\d{9}$/.test(p.replace(/\D/g, ''));

export function Login({ navigation }: P) {
  const { prefs } = useApp();
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = validPhone(phone);
  const isClient = prefs.role !== 'advocate';
  const send = async () => {
    const p = phone.replace(/\D/g, '');
    setBusy(true);
    try {
      await sendOtp(p, prefs.role ?? 'client');
      navigation.navigate('Otp', { phone: p });
    } catch (e) {
      Alert.alert(tr('Could not send the code'), errText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ paddingLeft: 8, paddingBottom: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconBtn icon={ArrowLeft} label="Back to role selection" color={colors.white} onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.replace('Role'))} />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.inkBorder, borderRadius: 999, paddingVertical: 5, paddingLeft: 5, paddingRight: 12 }}>
            <Image source={isClient ? IMG.ananya : IMG.rohan} style={{ width: 22, height: 22, borderRadius: 11 }} />
            <T w="semibold" size={12} color={colors.gold}>
              {isClient ? 'Client' : 'Advocate'}
            </T>
          </View>
        </View>
        <View style={{ paddingLeft: 12 }}>
          <ServerSwitch>
          <T w="serif" size={24} color={colors.white} style={{ marginTop: 8 }}>
            Log in
          </T>
          </ServerSwitch>
          <T size={14} color={colors.onInkMuted} lh={21} style={{ marginTop: 6 }}>
            Use your mobile number. New here? The same step creates your account.
          </T>
        </View>
      </InkHeader>
      <Body style={{ paddingTop: 24, paddingHorizontal: 20 }}>
        <Field
          label="Mobile number"
          prefix="+91"
          value={phone}
          onChangeText={t => setPhone(t.replace(/\D/g, '').slice(0, 10))}
          keyboardType="phone-pad"
          placeholder="10-digit mobile number"
          hint="We'll send a 6-digit code by SMS. No password needed."
          maxLength={10}
          big
          autoFocus
        />
      </Body>
      <BottomBar>
        <Button title="Get OTP" disabled={!ok} loading={busy} onPress={send} />
        <T size={12} color={colors.muted} center lh={18}>
          By continuing you agree to our Terms and Privacy Policy
        </T>
      </BottomBar>
    </View>
  );
}

/* ---------- OTP ---------- */

export function Otp({ navigation, route }: P) {
  const { prefs, login } = useApp();
  useLang();
  const phone: string = route.params?.phone ?? '';
  const [code, setCode] = useState('');
  const [left, setLeft] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const t = setInterval(() => setLeft(x => (x > 0 ? x - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  const verify = async (c = code) => {
    if (c.length !== 6 || busy) return;
    setBusy(true);
    setError('');
    try {
      await login(phone, c);
      // The store now holds the profile; Splash sends the user to the right first screen.
      resetTo(navigation, { name: 'Splash' });
    } catch (e) {
      setError(errText(e));
      setCode('');
      setBusy(false);
    }
  };
  const resend = async () => {
    try {
      await sendOtp(phone, prefs.role ?? 'client');
      setLeft(30);
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <InkHeader style={{ paddingLeft: 8, paddingBottom: 20 }}>
        <IconBtn icon={ArrowLeft} label="Back" color={colors.white} onPress={() => navigation.goBack()} />
        <View style={{ paddingLeft: 12 }}>
          <T w="serif" size={24} color={colors.white} style={{ marginTop: 8 }}>
            Enter the code
          </T>
          <T size={14} color={colors.onInkMuted} style={{ marginTop: 6 }}>
            {tr('Logging in as {role}', { role: tr(prefs.role === 'advocate' ? 'Advocate' : 'Client') })}
          </T>
        </View>
      </InkHeader>
      <Body gap={18} style={{ paddingTop: 24, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 12, padding: 14 }}>
          <View>
            <T size={12} w="medium" color={colors.muted}>
              Code sent to
            </T>
            <T w="bold" size={15} raw>
              {'+91 ' + phonePretty(phone)}
            </T>
          </View>
          <Tap onPress={() => navigation.goBack()} hitSlop={10}>
            <T w="semibold" size={13} color={colors.goldText}>
              Change
            </T>
          </Tap>
        </View>

        <Pressable onPress={() => input.current?.focus()} accessibilityLabel={tr('One-time code')} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {[0, 1, 2, 3, 4, 5].map(k => {
            const ch = code[k];
            const active = k === code.length;
            return (
              <View
                key={k}
                style={{
                  width: 48,
                  height: 56,
                  borderRadius: 12,
                  backgroundColor: colors.white,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: active ? 2 : ch ? 1.5 : 1,
                  borderColor: active ? colors.gold : ch ? colors.ink : colors.lineStrong,
                }}>
                <T w="bold" size={22} raw>
                  {ch ?? ''}
                </T>
              </View>
            );
          })}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          autoFocus
          keyboardType="number-pad"
          maxLength={6}
          textContentType="oneTimeCode"
          autoComplete="sms-otp"
          onChangeText={t => {
            const c = t.replace(/\D/g, '').slice(0, 6);
            setCode(c);
            if (c.length === 6) verify(c);
          }}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1, fontFamily: font.regular }}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <T size={13} w="medium" color={error ? colors.red : colors.muted} style={{ flex: 1 }} raw>
            {error || tr('Valid for 5 minutes')}
          </T>
          {left > 0 ? (
            <T size={13} w="medium" color={colors.muted} raw>
              {tr('Resend in') + ' 0:' + String(left).padStart(2, '0')}
            </T>
          ) : (
            <Tap onPress={resend} hitSlop={10}>
              <T size={13} w="semibold" color={colors.goldText}>
                Resend code
              </T>
            </Tap>
          )}
        </View>
      </Body>
      <BottomBar>
        <Button title="Verify and continue" disabled={code.length !== 6} loading={busy} onPress={() => verify()} />
      </BottomBar>
    </View>
  );
}
