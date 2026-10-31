'use client';

// Desempenho conforme o aparelho. "auto" (padrão) liga o modo leve sozinho em aparelhos modestos;
// "full" e "lite" forçam. A escolha fica salva NESTE aparelho (o celular pode ser leve e o PC não).
//
// Modo leve = o mesmo visual com efeitos mais baratos: sem vidro fosco, sombras de uma camada,
// nada se mexendo sozinho no fundo e o clima animado em resolução e ritmo menores.
import { useEffect, useState } from 'react';

const PREF_KEY = 'mural:desempenho';
const PROBE_KEY = 'mural:desempenho-medido'; // resultado da medição nesta sessão
const MIN_FPS = 40; // abaixo disso, parado, o aparelho não dá conta dos efeitos completos
// (a medição é ignorada abaixo de 10: aí é o navegador desacelerando uma janela encoberta)

function readPref() {
  try {
    const v = localStorage.getItem(PREF_KEY);
    return v === 'full' || v === 'lite' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

// O que o próprio aparelho conta: pouca memória (Chrome/Android: Galaxy A com 4–6 GB informa 4),
// poucos núcleos, economia de dados ligada
function deviceHint() {
  const n = navigator;
  if (n.connection?.saveData) return 'economia';
  if (n.deviceMemory && n.deviceMemory <= 4) return 'memoria';
  if (n.hardwareConcurrency && n.hardwareConcurrency <= 2) return 'processador';
  return null;
}

// Quadros por segundo com o mural parado, por `ms` milissegundos
function measureFps(ms) {
  return new Promise((resolve) => {
    let frames = 0;
    const t0 = performance.now();
    const loop = (t) => {
      frames++;
      if (t - t0 < ms) requestAnimationFrame(loop);
      else resolve((frames * 1000) / (t - t0));
    };
    requestAnimationFrame(loop);
  });
}

export function usePerformanceMode() {
  const [pref, setPrefState] = useState('auto');
  const [autoReason, setAutoReason] = useState(null); // por que o automático escolheu o leve

  useEffect(() => {
    setPrefState(readPref());
    let measured = null;
    try {
      measured = sessionStorage.getItem(PROBE_KEY);
    } catch {}
    setAutoReason(deviceHint() ?? (measured === 'lento' ? 'lento' : null));
  }, []);

  // Automático e nada indicou aparelho modesto: mede a fluidez com o mural PARADO alguns segundos
  // depois de abrir (a entrada dos post-its já terminou), uma vez por sessão e só com a aba à vista.
  // Se a pessoa mexer durante a medição (arrastar, rolar, digitar), não conta: tenta de novo (até 3 vezes).
  useEffect(() => {
    if (pref !== 'auto' || autoReason) return;
    let done = false;
    try {
      done = sessionStorage.getItem(PROBE_KEY) !== null;
    } catch {}
    if (done) return;
    let cancelled = false;
    let lastInput = 0;
    let timer = 0;
    const onInput = () => (lastInput = performance.now());
    const events = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart', 'scroll'];
    events.forEach((e) => window.addEventListener(e, onInput, { passive: true, capture: true }));
    const attempt = (tries) => {
      timer = setTimeout(async () => {
        if (document.hidden) return attempt(tries);
        const start = performance.now();
        const fps = await measureFps(2000);
        if (cancelled) return;
        // abaixo de 10 fps não é aparelho fraco: é o navegador economizando (janela encoberta ou minimizada)
        if (document.hidden || lastInput >= start || fps < 10) return tries > 1 && attempt(tries - 1);
        const slow = fps < MIN_FPS;
        try {
          sessionStorage.setItem(PROBE_KEY, slow ? 'lento' : 'ok');
        } catch {}
        if (slow) setAutoReason('lento');
      }, 5000);
    };
    attempt(3);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      events.forEach((e) => window.removeEventListener(e, onInput, { capture: true }));
    };
  }, [pref, autoReason]);

  const lite = pref === 'lite' || (pref === 'auto' && autoReason !== null);

  useEffect(() => {
    document.documentElement.classList.toggle('lite', lite);
  }, [lite]);

  const setPref = (v) => {
    setPrefState(v);
    try {
      if (v === 'auto') localStorage.removeItem(PREF_KEY);
      else localStorage.setItem(PREF_KEY, v);
    } catch {}
  };

  return { pref, setPref, lite, autoReason };
}

// Frase curta para as Configurações explicando o que o automático decidiu
export function autoReasonLabel(reason) {
  return (
    {
      economia: 'a economia de dados está ligada',
      memoria: 'este aparelho tem pouca memória',
      processador: 'este aparelho tem poucos núcleos',
      lento: 'a tela ficou abaixo de 40 quadros por segundo',
    }[reason] ?? null
  );
}
