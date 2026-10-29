// Tema (escuro/claro/automático), tamanho da letra e alto contraste.
// Aplicados no <html>, então valem para todas as telas (inclusive login).
// Uma cópia fica no navegador só para a próxima tela já abrir certa (as preferências de verdade ficam no back).
const KEY = 'mural_look';

let mq = null;
let current = { theme: 'dark', fontScale: 1, highContrast: false };

function resolvedTheme(theme) {
  if (theme !== 'auto') return theme;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

function paint() {
  const html = document.documentElement;
  const theme = resolvedTheme(current.theme);
  html.classList.toggle('theme-light', theme === 'light');
  html.classList.toggle('theme-dark', theme !== 'light');
  html.classList.toggle('hc', Boolean(current.highContrast));
  html.style.fontSize = current.fontScale && current.fontScale !== 1 ? `${16 * current.fontScale}px` : '';
  html.style.colorScheme = theme === 'light' ? 'light' : 'dark';
}

export function applyAppearance({ theme = 'dark', fontScale = 1, highContrast = false } = {}) {
  current = { theme, fontScale, highContrast };
  paint();
  // "automático" acompanha a troca de tema do celular/PC na hora
  if (!mq) {
    mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', () => current.theme === 'auto' && paint());
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {}
}

export function applyCachedAppearance() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved) applyAppearance(saved);
  } catch {}
}
