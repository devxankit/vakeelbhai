import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the app finds the Vakeel Bhai API (backend/).
 *
 * DEVELOPMENT / TESTING: the API runs on a computer on the same Wi-Fi as the phone. In a
 * testing build the address can be changed inside the app (long-press the logo on the
 * "Who are you?" screen), so a new Wi-Fi network never needs a new APK. The Android
 * emulator reaches the computer at 10.0.2.2.
 *
 * PRODUCTION: the HTTPS address of the deployed API, fixed. Plain http is only allowed while
 * VB_ALLOW_HTTP=true in android/gradle.properties; switch that off for the Play Store.
 */
const DEV_API_URL = 'http://192.168.1.9:5055';
const PROD_API_URL = 'https://api.vakeelbhai.com'; // TODO: the real domain once the server is deployed

/** true: a release build talks to a development server (testing on phones). false for the Play Store. */
const RELEASE_USES_DEV_SERVER = true;

/** The server address can be changed in the app only in testing builds. */
export const CAN_CHANGE_SERVER = __DEV__ || RELEASE_USES_DEV_SERVER;
export const DEFAULT_API_URL = CAN_CHANGE_SERVER ? DEV_API_URL : PROD_API_URL;

const KEY = 'vakeelbhai.server.v1';
let current = DEFAULT_API_URL;

/** The API address in use (no trailing slash). */
export const apiUrl = () => current;

/** Read a saved address at start-up (testing builds only). */
export async function loadApiUrl() {
  if (!CAN_CHANGE_SERVER) return current;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) current = saved;
  } catch {}
  return current;
}

/** "192.168.1.9:5055" → "http://192.168.1.9:5055". Empty = back to the default. */
export async function setApiUrl(input: string) {
  let u = input.trim().replace(/\/+$/, '');
  if (u && !/^https?:\/\//i.test(u)) u = 'http://' + u;
  current = u || DEFAULT_API_URL;
  if (u) await AsyncStorage.setItem(KEY, u);
  else await AsyncStorage.removeItem(KEY);
  return current;
}
