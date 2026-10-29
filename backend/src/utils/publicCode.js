import crypto from 'node:crypto';

// ID público de cada pessoa (ex.: "K7P2-9QXM"), para convidar sem precisar do e-mail.
// Sem letras/números que se confundem (0/O, 1/I/L) e aleatório: não revela quantas contas existem.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

export function generatePublicCode() {
  const bytes = crypto.randomBytes(8);
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
}

// Aceita como a pessoa colar: minúsculas, sem hífen, com espaços ("k7p2 9qxm")
export function normalizePublicCode(value) {
  const raw = String(value ?? '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  if (raw.length !== 8 || [...raw].some((c) => !ALPHABET.includes(c))) return null;
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}
