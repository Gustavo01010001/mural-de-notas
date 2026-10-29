'use client';

// "Ao vivo" numa pasta compartilhada: presença, cursores e aviso de mudanças.
// Usa fetch + leitura do fluxo (Server-Sent Events) para poder mandar o token no cabeçalho.
import { useCallback, useEffect, useRef, useState } from 'react';
import { getToken } from './api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const STALE_MS = 15_000; // cursor parado há muito tempo some

export function useLiveFolder(folderId, enabled, { onNotesChanged, onFolderChanged, onKicked }) {
  const [presence, setPresence] = useState([]);
  const [cursors, setCursors] = useState({});
  const [connected, setConnected] = useState(false);
  const handlers = useRef({ onNotesChanged, onFolderChanged, onKicked });
  handlers.current = { onNotesChanged, onFolderChanged, onKicked };
  const lastSent = useRef(0);
  const pending = useRef(null);
  const timer = useRef(null);

  useEffect(() => {
    setPresence([]);
    setCursors({});
    setConnected(false);
    if (!enabled || !folderId) return;

    let stopped = false;
    let ctrl = null;
    let retry = 1000;

    async function run() {
      while (!stopped) {
        ctrl = new AbortController();
        try {
          const res = await fetch(`${API_URL}/live/folders/${folderId}`, {
            headers: { Authorization: `Bearer ${getToken()}`, Accept: 'text/event-stream' },
            signal: ctrl.signal,
            cache: 'no-store',
          });
          if (res.status === 404 || res.status === 401) {
            handlers.current.onKicked?.();
            return;
          }
          if (!res.ok || !res.body) throw new Error('falhou');
          setConnected(true);
          retry = 1000;
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) !== -1) {
              const raw = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const ev = /^event: (.+)$/m.exec(raw)?.[1];
              const dataLine = /^data: (.+)$/m.exec(raw)?.[1];
              if (!ev) continue;
              const data = dataLine ? JSON.parse(dataLine) : {};
              if (ev === 'hello' || ev === 'presence') setPresence(data.presence);
              else if (ev === 'cursor') setCursors((c) => ({ ...c, [data.userId]: { ...data, t: Date.now() } }));
              else if (ev === 'cursor-leave')
                setCursors((c) => {
                  const n = { ...c };
                  delete n[data.userId];
                  return n;
                });
              else if (ev === 'notes') handlers.current.onNotesChanged?.();
              else if (ev === 'folder') handlers.current.onFolderChanged?.(false);
              else if (ev === 'folder-removed') handlers.current.onFolderChanged?.(true);
              else if (ev === 'kicked') {
                handlers.current.onKicked?.();
                return;
              }
            }
          }
        } catch {
          if (stopped) return;
        }
        setConnected(false);
        if (stopped) return;
        await new Promise((r) => setTimeout(r, retry));
        retry = Math.min(retry * 2, 15_000); // caiu: tenta de novo, cada vez esperando um pouco mais
      }
    }
    run();

    // some com cursores parados
    const sweep = setInterval(() => {
      setCursors((c) => {
        const now = Date.now();
        const fresh = Object.fromEntries(Object.entries(c).filter(([, v]) => now - v.t < STALE_MS));
        return Object.keys(fresh).length === Object.keys(c).length ? c : fresh;
      });
    }, 3000);

    return () => {
      stopped = true;
      ctrl?.abort();
      clearInterval(sweep);
    };
  }, [folderId, enabled]);

  // Manda a posição do meu cursor (no máximo ~16 vezes por segundo)
  const sendCursor = useCallback(
    (x, y) => {
      if (!enabled || !folderId) return;
      pending.current = { x, y };
      const now = Date.now();
      const wait = 60 - (now - lastSent.current);
      const flush = () => {
        const p = pending.current;
        if (!p) return;
        pending.current = null;
        lastSent.current = Date.now();
        fetch(`${API_URL}/live/folders/${folderId}/cursor`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(p),
        }).catch(() => {});
      };
      if (wait <= 0) flush();
      else if (!timer.current) {
        timer.current = setTimeout(() => {
          timer.current = null;
          flush();
        }, wait);
      }
    },
    [enabled, folderId],
  );

  return { presence, cursors, connected, sendCursor };
}
