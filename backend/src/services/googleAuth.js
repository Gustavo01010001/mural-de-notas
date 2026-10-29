// "Entrar com Google": o navegador recebe do Google um ID token (JWT assinado) e manda para cá.
// Aqui conferimos a assinatura com as chaves públicas do Google, o público (seu CLIENT_ID),
// quem emitiu e a validade. Só então confiamos no e-mail.
// Configure GOOGLE_CLIENT_ID no backend/.env (e NEXT_PUBLIC_GOOGLE_CLIENT_ID no frontend).
import crypto from 'node:crypto';
import { HttpError } from '../utils/httpError.js';

const CERTS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
let cache = { keys: null, until: 0 };

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID);

async function googleKeys() {
  if (cache.keys && cache.until > Date.now()) return cache.keys;
  const res = await fetch(CERTS_URL, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new HttpError(502, 'Não consegui falar com o Google agora.');
  const { keys } = await res.json();
  cache = { keys, until: Date.now() + 60 * 60_000 };
  return keys;
}

const b64json = (part) => JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));

/**
 * Confere o ID token. `getKeys` pode ser trocado nos testes (chaves geradas localmente).
 * Devolve { sub, email, name } se tudo estiver certo.
 */
export async function verifyGoogleIdToken(idToken, { clientId = process.env.GOOGLE_CLIENT_ID, getKeys = googleKeys, now = Date.now() } = {}) {
  const parts = String(idToken ?? '').split('.');
  if (parts.length !== 3) throw new HttpError(400, 'Login com Google inválido.');
  let header;
  let payload;
  try {
    header = b64json(parts[0]);
    payload = b64json(parts[1]);
  } catch {
    throw new HttpError(400, 'Login com Google inválido.');
  }
  if (header.alg !== 'RS256') throw new HttpError(401, 'Login com Google inválido.');

  const jwk = (await getKeys()).find((k) => k.kid === header.kid);
  if (!jwk) throw new HttpError(401, 'Login com Google inválido (chave desconhecida).');
  const ok = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${parts[0]}.${parts[1]}`),
    crypto.createPublicKey({ key: jwk, format: 'jwk' }),
    Buffer.from(parts[2], 'base64url'),
  );
  if (!ok) throw new HttpError(401, 'Login com Google inválido (assinatura).');
  if (!ISSUERS.includes(payload.iss)) throw new HttpError(401, 'Login com Google inválido (emissor).');
  if (payload.aud !== clientId) throw new HttpError(401, 'Login com Google inválido (app errado).');
  if (!payload.exp || payload.exp * 1000 < now) throw new HttpError(401, 'Login com Google expirado. Tente de novo.');
  if (!payload.email || payload.email_verified === false) throw new HttpError(401, 'Sua conta Google não tem e-mail confirmado.');

  return { sub: String(payload.sub), email: String(payload.email).toLowerCase(), name: String(payload.name || payload.email.split('@')[0]).slice(0, 60) };
}
