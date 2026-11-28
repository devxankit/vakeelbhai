import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiUrl } from './config';

/**
 * Client for the Vakeel Bhai API. The mobile app gets its tokens in the response body
 * (the website uses a cookie instead):
 *   access token  in memory only, about 15 minutes
 *   refresh token kept on the device, rotated on every use (an old one cannot be reused)
 * A call that gets 401 refreshes once and retries. If the refresh fails, the user is
 * signed out (onSignedOut).
 */

const KEY = 'vakeelbhai.auth.v1';

export class ApiError extends Error {
  status: number;
  code: string;
  details?: { path?: string; message: string }[];
  constructor(status: number, body?: any) {
    super(body?.error?.message || (status ? 'Something went wrong (' + status + ')' : 'Could not reach Vakeel Bhai. Check your internet connection.'));
    this.status = status;
    this.code = body?.error?.code || (status ? 'ERROR' : 'NETWORK');
    this.details = body?.error?.details;
  }
}

/** One readable line for an alert. */
export function errText(e: unknown) {
  const err = e as ApiError;
  if (Array.isArray(err?.details) && err.details.length && err.details[0]?.message) return err.details.map(d => d.message).join('\n');
  return err?.message ?? 'Something went wrong';
}

let access: string | null = null;
let accessExp = 0;
let refreshToken: string | null = null;
let refreshing: Promise<any> | null = null;
let signedOut: () => void = () => {};

export const onSignedOut = (fn: () => void) => {
  signedOut = fn;
};

function expOf(jwt: string) {
  try {
    let part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    part += '='.repeat((4 - (part.length % 4)) % 4);
    const decode: ((s: string) => string) | undefined = (globalThis as any).atob;
    const json = JSON.parse(decode ? decode(part) : '{}');
    return (json.exp ?? 0) * 1000;
  } catch {
    return Date.now() + 10 * 60 * 1000;
  }
}

function setTokens(d: { accessToken: string; refreshToken?: string }) {
  access = d.accessToken;
  accessExp = expOf(d.accessToken);
  if (d.refreshToken) {
    refreshToken = d.refreshToken;
    AsyncStorage.setItem(KEY, JSON.stringify({ refreshToken })).catch(() => {});
  }
}

export async function clearTokens() {
  access = null;
  accessExp = 0;
  refreshToken = null;
  await AsyncStorage.removeItem(KEY).catch(() => {});
}

/** Load the saved refresh token at start-up. True if the device has a session. */
export async function loadTokens() {
  try {
    const saved = await AsyncStorage.getItem(KEY);
    refreshToken = saved ? JSON.parse(saved).refreshToken ?? null : null;
  } catch {
    refreshToken = null;
  }
  return !!refreshToken;
}

type Opts = { method?: string; body?: any; form?: FormData; auth?: boolean };

async function raw(path: string, { method = 'GET', body, form, auth = true }: Opts = {}, bearer?: string | null) {
  let res: Response;
  try {
    res = await fetch(apiUrl() + '/api' + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(auth && bearer ? { Authorization: 'Bearer ' + bearer } : {}),
      },
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0);
  }
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new ApiError(res.status, json);
  return json as { success: true; data: any; meta?: any };
}

/** Exchange the refresh token for a new pair. Shared, so parallel calls refresh once. */
export function refresh() {
  if (!refreshToken) return Promise.reject(new ApiError(401, { error: { code: 'SESSION_ENDED', message: 'Please log in' } }));
  refreshing ??= raw('/auth/refresh', { method: 'POST', body: { refreshToken }, auth: false })
    .then(j => {
      setTokens(j.data);
      return j.data;
    })
    .catch(async e => {
      // Only a real "no" from the server ends the session; a network error keeps it for later.
      if (e.status === 401 || e.status === 403) {
        await clearTokens();
        signedOut();
      }
      throw e;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** A valid access token (refreshing it first if it is about to expire). */
export async function token() {
  if (!access || Date.now() > accessExp - 30_000) await refresh();
  return access!;
}

/** Call the API as the logged-in user. Retries once after refreshing an expired token. */
export async function api(path: string, opts: Opts = {}) {
  if (opts.auth === false) return raw(path, opts);
  const t = await token();
  try {
    return await raw(path, opts, t);
  } catch (e: any) {
    if (e.status !== 401) throw e;
    await refresh();
    return raw(path, opts, access);
  }
}

/** Log in with the OTP; keeps the tokens. */
export async function verifyOtp(phone: string, role: string, otp: string) {
  const j = await raw('/auth/otp/verify', { method: 'POST', body: { phone, role, otp }, auth: false });
  setTokens(j.data);
  return j.data as { user: any; isNew: boolean };
}

export const sendOtp = (phone: string, role: string) => raw('/auth/otp/send', { method: 'POST', body: { phone, role }, auth: false });

/** One photo as multipart form data (field "file"). `uri` is a local file from the camera or gallery. */
export function photoForm(uri: string) {
  const fd = new FormData();
  const ext = /\.png$/i.test(uri) ? 'png' : /\.webp$/i.test(uri) ? 'webp' : 'jpg';
  fd.append('file', { uri, name: 'photo.' + ext, type: 'image/' + (ext === 'jpg' ? 'jpeg' : ext) } as any);
  return fd;
}

/** Image source for a private file (documents, photos): sent with the login token. */
export async function fileSource(path: string) {
  return { uri: apiUrl() + '/api' + path, headers: { Authorization: 'Bearer ' + (await token()) } };
}

export { apiUrl };
