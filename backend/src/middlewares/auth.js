import { SessionModel, SESSION_MAX_AGE_MS } from '../models/sessionModel.js';
import { HttpError } from '../utils/httpError.js';

export const COOKIE_NAME = 'mural_session';

// Lê um cookie do cabeçalho (sem biblioteca)
function readCookie(req, name) {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

// Cookie seguro: o JavaScript da página não consegue ler (httpOnly), só vai por HTTPS (Secure)
// e não é enviado por outros sites (SameSite=Lax)
function isHttps(req) {
  if (process.env.COOKIE_SECURE === '0') return false;
  if (process.env.COOKIE_SECURE === '1') return true;
  return req.secure || req.headers['x-forwarded-proto'] === 'https';
}

export function setSessionCookie(req, res, token) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps(req),
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE_MS,
  });
}

export function clearSessionCookie(req, res) {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, secure: isHttps(req), sameSite: 'lax', path: '/' });
}

/**
 * Aceita a sessão pelo cookie (navegador) ou pelo cabeçalho Bearer (testes/scripts).
 * Pedidos que mudam algo usando o cookie precisam do cabeçalho X-Mural: um site de fora
 * não consegue mandar esse cabeçalho, então isso bloqueia ataques de CSRF.
 */
export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const bearer = header.startsWith('Bearer ') ? header.slice(7) : null;
  const cookie = bearer ? null : readCookie(req, COOKIE_NAME);
  const token = bearer ?? cookie;

  if (cookie && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-mural'] !== '1') {
    throw new HttpError(403, 'Pedido bloqueado por segurança. Recarregue a página.');
  }
  const user = token ? SessionModel.findUserByToken(token) : null;
  if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  req.user = { id: user.id, name: user.name, email: user.email, code: user.public_code, created_at: user.created_at, hasGoogle: Boolean(user.has_google), hasPassword: Boolean(user.has_password) };
  req.token = token;
  next();
}
