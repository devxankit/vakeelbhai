import React, { useState } from 'react';
import { Modal, Pressable, TextInput, View } from 'react-native';
import T from './T';
import { Button, Note } from './ui';
import { colors, font } from '../theme';
import { apiUrl, CAN_CHANGE_SERVER, DEFAULT_API_URL, setApiUrl } from '../api/config';
import { closeLive } from '../api/live';
import { useApp } from '../store/AppStore';

/**
 * TESTING BUILDS ONLY: long-press the child (the logo) to change the server address,
 * e.g. when the computer running the API moves to another Wi-Fi network. Store builds
 * (CAN_CHANGE_SERVER = false) render the child as it is.
 */
export default function ServerSwitch({ children }: { children: React.ReactNode }) {
  const { reloadMeta } = useApp();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [check, setCheck] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!CAN_CHANGE_SERVER) return <>{children}</>;

  const normalised = () => {
    const u = value.trim().replace(/\/+$/, '');
    return u && !/^https?:\/\//i.test(u) ? 'http://' + u : u;
  };
  const test = async () => {
    setBusy(true);
    setCheck(null);
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(normalised() + '/api/health', { signal: ctrl.signal });
      const j = await r.json();
      setCheck(j?.success ? { ok: true, text: 'Connected. Database ' + j.data.db + '.' } : { ok: false, text: 'The server answered with an error (' + r.status + ').' });
    } catch {
      setCheck({ ok: false, text: 'No answer. Check the address, that the phone is on the same Wi-Fi, and the Windows Firewall.' });
    } finally {
      clearTimeout(t);
      setBusy(false);
    }
  };
  const save = async (reset = false) => {
    await setApiUrl(reset ? '' : normalised());
    closeLive();
    await reloadMeta();
    setOpen(false);
  };

  return (
    <>
      <Pressable
        onLongPress={() => {
          setValue(apiUrl().replace(/^http:\/\//, ''));
          setCheck(null);
          setOpen(true);
        }}
        delayLongPress={600}>
        {children}
      </Pressable>
      <Modal visible={open} transparent animationType="slide" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.white, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 }}>
            <T w="bold" size={17}>
              Server address (testing)
            </T>
            <T size={13} color={colors.text2} lh={19}>
              The computer running the Vakeel Bhai API, on the same Wi-Fi. On Windows: ipconfig, IPv4 Address, then the port.
            </T>
            <TextInput
              value={value}
              onChangeText={t => {
                setValue(t);
                setCheck(null);
              }}
              placeholder="192.168.1.9:5055"
              placeholderTextColor={colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              style={{ height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.lineStrong, paddingHorizontal: 14, fontFamily: font.semibold, fontSize: 16, color: colors.text }}
            />
            {check ? <Note tone={check.ok ? 'green' : 'orange'}>{check.text}</Note> : null}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <Button title="Check connection" variant="line" loading={busy} disabled={!value.trim()} onPress={test} style={{ flex: 1 }} />
              <Button title="Save" disabled={!value.trim()} onPress={() => save()} style={{ flex: 1 }} />
            </View>
            <Button title={'Use the default (' + DEFAULT_API_URL.replace(/^https?:\/\//, '') + ')'} variant="ghost" small onPress={() => save(true)} />
          </View>
        </View>
      </Modal>
    </>
  );
}
