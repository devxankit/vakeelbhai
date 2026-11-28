import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, Modal, StyleProp, View } from 'react-native';
import { CloudOff, FlaskConical, ImageOff, User } from 'lucide-react-native';
import T from './T';
import { Button, Note } from './ui';
import { colors } from '../theme';
import { api, ApiError, errText, fileSource } from '../api/client';
import { inr } from '../utils/money';
import { tr } from '../i18n';

/* ---------- loading and errors ---------- */

export function Loading({ label }: { label?: string }) {
  return (
    <View style={{ paddingVertical: 48, alignItems: 'center', gap: 10 }}>
      <ActivityIndicator color={colors.ink} />
      {label ? (
        <T size={13} color={colors.muted}>
          {label}
        </T>
      ) : null}
    </View>
  );
}

export function LoadError({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <View style={{ paddingVertical: 36, paddingHorizontal: 24, alignItems: 'center', gap: 10 }}>
      <CloudOff size={34} color={colors.muted} />
      <T w="bold" size={16} center>
        Could not load this
      </T>
      <T size={13} color={colors.muted} center raw>
        {error}
      </T>
      {onRetry ? <Button title="Try again" small variant="line" onPress={onRetry} /> : null}
    </View>
  );
}

/* ---------- private images ---------- */

/**
 * A private image from the API (advocate photo, documents, chat photos). The request
 * carries the login token, so these files are never public links.
 */
export function SecureImage({ path, style, version, fallback = 'photo', resizeMode }: { path: string | null; style: StyleProp<ImageStyle>; version?: number | string; fallback?: 'photo' | 'image'; resizeMode?: 'cover' | 'contain' }) {
  const [src, setSrc] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setFailed(false);
    if (!path) return;
    fileSource(path)
      .then(s => live && setSrc({ ...s, uri: s.uri + (version ? (s.uri.includes('?') ? '&' : '?') + 'v=' + version : '') }))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [path, version]);
  const flat = (style ?? {}) as any;
  if (!path || failed) {
    const size = typeof flat.width === 'number' ? flat.width * 0.45 : 20;
    return <View style={[style as any, { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' }]}>{fallback === 'photo' ? <User size={size} color={colors.muted} /> : <ImageOff size={size} color={colors.muted} />}</View>;
  }
  if (!src) return <View style={[style as any, { backgroundColor: colors.surface2 }]} />;
  return <Image source={src} style={style} resizeMode={resizeMode} onError={() => setFailed(true)} />;
}

/* ---------- payments ---------- */

export type Checkout = { payment: { id: string }; gateway: { provider: string; keyId: string | null; orderId: string; amount: number; currency: string } | null };

/**
 * Runs the gateway step of a checkout started on the server, then asks the SERVER to
 * verify it. Nothing is marked paid by the app: the server checks the gateway's signature
 * and the payment itself.
 *   sandbox  (development only) a clearly labelled test window, no money moves
 *   razorpay Razorpay Checkout: added with react-native-razorpay once the keys exist
 *
 * const { pay, sheet } = usePay(); … await pay(checkout); … render {sheet}
 */
export function usePay() {
  const [open, setOpen] = useState<Checkout | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<{ resolve: (v: any) => void; reject: (e: any) => void } | null>(null);

  const pay = useCallback(async (co: Checkout) => {
    if (!co.gateway) return co.payment; // fully paid from the wallet
    if (co.gateway.provider === 'sandbox') {
      return new Promise((resolve, reject) => {
        pending.current = { resolve, reject };
        setOpen(co);
      });
    }
    await api('/payments/' + co.payment.id + '/cancel', { method: 'POST' }).catch(() => {});
    throw new ApiError(503, { error: { code: 'GATEWAY_NOT_IN_APP', message: tr('Online payment opens here once Razorpay is connected to the app.') } });
  }, []);

  const finish = (outcome: 'paid' | 'cancel', value?: any) => {
    const p = pending.current;
    const co = open;
    pending.current = null;
    setOpen(null);
    if (outcome === 'cancel') {
      if (co) api('/payments/' + co.payment.id + '/cancel', { method: 'POST' }).catch(() => {});
      p?.reject(Object.assign(new Error('Payment cancelled'), { code: 'CANCELLED' }));
    } else p?.resolve(value);
  };

  const sandboxPay = async () => {
    if (!open) return;
    setBusy(true);
    try {
      const g = (await api('/payments/' + open.payment.id + '/sandbox-pay', { method: 'POST' })).data;
      const paid = (await api('/payments/' + open.payment.id + '/verify', { method: 'POST', body: g })).data;
      finish('paid', paid);
    } catch (e) {
      const p = pending.current;
      pending.current = null;
      setOpen(null);
      p?.reject(new Error(errText(e)));
    } finally {
      setBusy(false);
    }
  };

  const sheet = (
    <Modal visible={!!open} transparent animationType="slide" onRequestClose={() => finish('cancel')} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 14 }}>
          <T w="bold" size={17}>
            Test payment (development)
          </T>
          <Note tone="orange" icon={FlaskConical}>
            Sandbox gateway for development: no money moves. In production this is the Razorpay window (UPI, cards, netbanking).
          </Note>
          <T size={13} color={colors.text2}>
            The server still verifies this payment exactly as it would a real one.
          </T>
          <Button title={open?.gateway ? tr('Pay') + ' ' + inr(open.gateway.amount / 100) : 'Pay'} loading={busy} onPress={sandboxPay} />
          <Button title="Cancel" variant="line" disabled={busy} onPress={() => finish('cancel')} />
        </View>
      </View>
    </Modal>
  );

  return { pay, sheet };
}
