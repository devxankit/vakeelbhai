import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { apiUrl } from './config';
import { refresh, token } from './client';

/**
 * Live updates from the API (Socket.IO). Events only say "something changed"; screens
 * re-fetch from the REST API, which stays the source of truth.
 *   request:update · message · case:new · challan:update · support:update · notification
 */
let socket: Socket | null = null;

function get() {
  if (socket) return socket;
  socket = io(apiUrl(), {
    path: '/socket.io',
    transports: ['websocket'],
    auth: cb => {
      token()
        .then(t => cb({ token: t }))
        .catch(() => cb({ token: '' }));
    },
  });
  socket.on('connect_error', async e => {
    if (!/TOKEN_EXPIRED|SESSION_ENDED|UNAUTHORIZED|INVALID_TOKEN/.test(e.message)) return;
    try {
      await refresh();
      socket?.connect();
    } catch {
      /* signed out: the store handles it */
    }
  });
  return socket;
}

export function closeLive() {
  socket?.close();
  socket = null;
}

/** Subscribe while mounted: useLive({ message: p => ... }). `reconnect` runs after a reconnect. */
export function useLive(handlers: Record<string, (p: any) => void>, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  const names = Object.keys(handlers).sort().join(',');
  useEffect(() => {
    if (!enabled) return;
    const s = get();
    const fns = names
      .split(',')
      .filter(n => n && n !== 'reconnect')
      .map(n => [n, (p: any) => ref.current[n]?.(p)] as const);
    fns.forEach(([n, f]) => s.on(n, f));
    const onRe = () => ref.current.reconnect?.(undefined);
    s.io.on('reconnect', onRe);
    return () => {
      fns.forEach(([n, f]) => s.off(n, f));
      s.io.off('reconnect', onRe);
    };
  }, [names, enabled]);
}
