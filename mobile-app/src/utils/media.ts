import { Alert, Linking } from 'react-native';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';
import { SUPPORT_WHATSAPP } from '../data/catalog';
import { tr } from '../i18n';

const OPTS = { mediaType: 'photo' as const, quality: 0.7 as const, maxWidth: 1600, maxHeight: 1600, saveToPhotos: false };

function pick(res: ImagePickerResponse): string | null {
  if (res.didCancel) return null;
  if (res.errorCode) {
    Alert.alert(tr('Could not open the camera'), res.errorMessage ?? res.errorCode);
    return null;
  }
  return res.assets?.[0]?.uri ?? null;
}

/** Opens the camera; returns a local file uri, or null if cancelled. */
export async function takePhoto(front = false) {
  return pick(await launchCamera({ ...OPTS, cameraType: front ? 'front' : 'back' }));
}

export async function choosePhoto() {
  return pick(await launchImageLibrary({ ...OPTS, selectionLimit: 1 }));
}

/** WhatsApp support with a prefilled topic. The number comes from the admin panel later. */
export function openWhatsApp(topic: string) {
  const text = encodeURIComponent('Hi Vakeel Bhai, I need help with: ' + topic);
  const url = SUPPORT_WHATSAPP ? 'https://wa.me/' + SUPPORT_WHATSAPP + '?text=' + text : 'whatsapp://send?text=' + text;
  Linking.openURL(url).catch(() =>
    Alert.alert(tr('WhatsApp support'), tr('The support number will be added before launch. WhatsApp could not be opened on this phone.')),
  );
}
