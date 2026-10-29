// Sons suaves, criados na hora com Web Audio (nenhum arquivo de áudio para baixar).
// Só tocam se a pessoa ligar "Sons" nas configurações.
let ctx = null;
let prefs = { enabled: false, volume: 0.6, calm: false };

export function setSoundPrefs(next) {
  prefs = { ...prefs, ...next };
}

function audio() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

const level = () => prefs.volume * (prefs.calm ? 0.6 : 1) * 0.35;

// Nota curta com envelope suave (sem "estalo")
function tone(ac, { freq, to, start = 0, dur = 0.18, type = 'sine', gain = 1 }) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, level() * gain), t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// "Papel amassando": ruído filtrado que some rápido
function crumple(ac) {
  const dur = 0.28;
  const buffer = ac.createBuffer(1, Math.floor(ac.sampleRate * dur), ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2) * (Math.random() > 0.7 ? 1 : 0.35);
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 2200;
  filter.Q.value = 0.8;
  const g = ac.createGain();
  g.gain.value = level() * 0.9;
  src.connect(filter).connect(g).connect(ac.destination);
  src.start();
}

const SOUNDS = {
  pop: (ac) => tone(ac, { freq: 520, to: 880, dur: 0.12, gain: 0.9 }), // colou um post-it
  delete: (ac) => crumple(ac), // excluiu
  check: (ac) => tone(ac, { freq: 990, dur: 0.08, type: 'triangle', gain: 0.6 }), // marcou item
  done: (ac) => [660, 880, 1320].forEach((f, i) => tone(ac, { freq: f, start: i * 0.09, dur: 0.22, type: 'triangle', gain: 0.7 })), // checklist completa
  alert: (ac) => [784, 1046].forEach((f, i) => tone(ac, { freq: f, start: i * 0.16, dur: 0.45, gain: 0.8 })), // lembrete
  bell: (ac) => [523, 659, 784, 1046].forEach((f, i) => tone(ac, { freq: f, start: i * 0.12, dur: 0.9, gain: 0.7 })), // fim do timer de foco
  undo: (ac) => tone(ac, { freq: 880, to: 520, dur: 0.14, gain: 0.7 }),
};

export function playSound(name, { force = false } = {}) {
  if (!prefs.enabled && !force) return;
  const ac = audio();
  if (!ac || !SOUNDS[name]) return;
  try {
    SOUNDS[name](ac);
  } catch {}
}
