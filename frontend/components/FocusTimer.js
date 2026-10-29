'use client';

// Modo foco (Pomodoro): 25 min focando, 5 min de pausa. Discreto, como o cronômetro do Miro.
// O tempo fica guardado no navegador, então continua certo mesmo se recarregar a página.
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { playSound } from '@/lib/sounds';

const KEY = 'mural_focus';
const fmt = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

function load(focusMs) {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (s && s.mode) return s;
  } catch {}
  return { mode: 'focus', running: false, endsAt: null, left: focusMs, done: 0 };
}

export default function FocusTimer({ focusMinutes = 25, breakMinutes = 5, onClose, toast, calm }) {
  const focusMs = focusMinutes * 60_000;
  const breakMs = breakMinutes * 60_000;
  const [state, setState] = useState(() => (typeof window === 'undefined' ? null : load(focusMs)));
  const [now, setNow] = useState(Date.now());
  const titleRef = useRef(null);

  // salva a cada mudança
  useEffect(() => {
    if (!state) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {}
  }, [state]);

  // tempo novo nas configurações: vale para o próximo ciclo parado
  useEffect(() => {
    setState((s) => (s && !s.running ? { ...s, left: s.mode === 'focus' ? focusMs : breakMs } : s));
  }, [focusMs, breakMs]);

  useEffect(() => {
    if (!state?.running) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [state?.running]);

  const left = state?.running ? state.endsAt - now : state?.left ?? focusMs;

  // acabou o tempo: toca o sino, avisa e troca foco ⇄ pausa
  useEffect(() => {
    if (!state?.running || left > 0) return;
    const finishedFocus = state.mode === 'focus';
    playSound('bell', { force: true });
    const msg = finishedFocus ? `Hora da pausa! Descanse ${breakMinutes} min ☕` : 'Pausa acabou. Bora focar de novo! 🎯';
    toast(msg, 'success');
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') new Notification('⏱ Modo foco', { body: msg });
    const nextMode = finishedFocus ? 'break' : 'focus';
    const ms = nextMode === 'focus' ? focusMs : breakMs;
    setState((s) => ({ mode: nextMode, running: finishedFocus, endsAt: finishedFocus ? Date.now() + ms : null, left: ms, done: s.done + (finishedFocus ? 1 : 0) }));
  }, [left, state, breakMinutes, focusMs, breakMs, toast]);

  // mostra o tempo no título da aba enquanto roda
  useEffect(() => {
    if (titleRef.current === null) titleRef.current = document.title;
    document.title = state?.running ? `${state.mode === 'focus' ? '🎯' : '☕'} ${fmt(left)} · Mural de Notas` : titleRef.current;
  }, [left, state?.running, state?.mode]);
  useEffect(() => () => titleRef.current && (document.title = titleRef.current), []);

  if (!state) return null;

  const total = state.mode === 'focus' ? focusMs : breakMs;
  const progress = 1 - Math.max(0, left) / total;

  const start = () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') Notification.requestPermission().catch(() => {});
    setState((s) => ({ ...s, running: true, endsAt: Date.now() + Math.max(1000, s.left) }));
    setNow(Date.now());
  };
  const pause = () => setState((s) => ({ ...s, running: false, left: Math.max(0, s.endsAt - Date.now()), endsAt: null }));
  const reset = () => setState((s) => ({ ...s, running: false, endsAt: null, left: s.mode === 'focus' ? focusMs : breakMs }));
  const switchMode = () =>
    setState((s) => {
      const mode = s.mode === 'focus' ? 'break' : 'focus';
      return { ...s, mode, running: false, endsAt: null, left: mode === 'focus' ? focusMs : breakMs };
    });

  return (
    <motion.div
      className={`focus-timer ${state.mode}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      role="timer"
      aria-label={`${state.mode === 'focus' ? 'Foco' : 'Pausa'}: ${fmt(left)}`}
    >
      <span className="focus-progress" style={{ transform: `scaleX(${progress})` }} />
      <div className="focus-main">
        <button type="button" className="focus-mode" onClick={switchMode} title="Trocar entre foco e pausa">
          {state.mode === 'focus' ? '🎯 Foco' : '☕ Pausa'}
        </button>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={fmt(left).slice(0, 2)} className="focus-time" initial={calm ? false : { y: -8, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
            {fmt(left)}
          </motion.span>
        </AnimatePresence>
        {state.done > 0 && (
          <span className="focus-count" title={`${state.done} ciclo(s) de foco hoje`}>
            {'🍅'.repeat(Math.min(state.done, 4))}
            {state.done > 4 ? ` +${state.done - 4}` : ''}
          </span>
        )}
      </div>
      <div className="focus-actions">
        {state.running ? (
          <button type="button" onClick={pause} aria-label="Pausar">
            ⏸
          </button>
        ) : (
          <button type="button" className="primary" onClick={start} aria-label="Começar">
            ▶
          </button>
        )}
        {/* "recomeçar" só aparece quando já contou algum tempo (menos botões à toa) */}
        {left < total - 1000 && (
          <button type="button" onClick={reset} aria-label="Recomeçar" title="Recomeçar">
            ↺
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Esconder o timer" title="Esconder (o tempo continua guardado)">
          ✕
        </button>
      </div>
    </motion.div>
  );
}
