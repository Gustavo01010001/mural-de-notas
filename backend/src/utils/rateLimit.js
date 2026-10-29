import { HttpError } from './httpError.js';

// Limite simples de tentativas (em memória): protege login e "esqueci a senha" contra robôs
const hits = new Map(); // chave -> { count, resetAt }

export function hit(key, { max, windowMs, message }) {
  const now = Date.now();
  let entry = hits.get(key);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + windowMs };
    hits.set(key, entry);
  }
  entry.count++;
  if (entry.count > max) {
    const minutes = Math.ceil((entry.resetAt - now) / 60_000);
    throw new HttpError(429, message ?? `Muitas tentativas. Tente de novo em ${minutes} minuto${minutes === 1 ? '' : 's'}.`);
  }
}

export const clearHits = (key) => hits.delete(key);

// limpeza de vez em quando
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
}, 10 * 60_000).unref();
