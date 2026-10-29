// Única porta de saída do front para o back.
// O front só envia o que o usuário digitou e mostra o que o back responder.
// Por padrão chama "/api" no mesmo endereço da página; o Next repassa para o backend
// (ver rewrites em next.config.mjs). Funciona em localhost, pelo IP da rede e com HTTPS.
//
// Sessão: fica num cookie seguro (httpOnly) que o próprio navegador manda — o JavaScript
// da página nem consegue ler. Aqui guardamos só um "aviso" de que há login (sem segredo),
// para decidir rápido se mostra o mural ou a tela de entrar.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const HINT_KEY = 'mural_logged';
const LEGACY_TOKEN_KEY = 'mural_token'; // versões antigas guardavam o token aqui

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Cabeçalho que sites de fora não conseguem mandar: o back exige nos pedidos que mudam algo (anti-CSRF)
export const SAFE_HEADERS = { 'X-Mural': '1' };

export function hasSession() {
  try {
    return localStorage.getItem(HINT_KEY) === '1' || Boolean(localStorage.getItem(LEGACY_TOKEN_KEY));
  } catch {
    return false;
  }
}

export function markLoggedIn() {
  try {
    localStorage.setItem(HINT_KEY, '1');
  } catch {}
}

export function clearSession() {
  try {
    localStorage.removeItem(HINT_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {}
  // ao sair, esquece as fotos carregadas nesta aba
  for (const url of imageCache.values()) URL.revokeObjectURL(url);
  imageCache.clear();
}

/** Quem ainda tem o token antigo no navegador: troca por cookie seguro e apaga o token. */
export async function migrateLegacyToken() {
  let legacy = null;
  try {
    legacy = localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {}
  if (!legacy) return;
  try {
    await fetch(`${API_URL}/auth/cookie`, { method: 'POST', headers: { Authorization: `Bearer ${legacy}`, ...SAFE_HEADERS } });
  } catch {}
  try {
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  } catch {}
  markLoggedIn();
}

export function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Baixa a foto de um post-it (o cookie vai junto) e devolve um endereço local para o <img>
const imageCache = new Map();
export async function noteImageUrl(noteId, version) {
  const key = `${noteId}:${version}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const res = await fetch(`${API_URL}/notes/${noteId}/image`, { cache: 'no-store', credentials: 'same-origin' });
  if (!res.ok) throw new ApiError('Foto indisponível.', res.status);
  const url = URL.createObjectURL(await res.blob());
  imageCache.set(key, url);
  return url;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { ...SAFE_HEADERS };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  // O fuso vai junto para o back saber qual é o "hoje" do usuário
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_URL}${path}${sep}tz=${encodeURIComponent(userTimeZone())}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      credentials: 'same-origin',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Não consegui falar com o servidor. O backend está rodando?', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearSession();
    throw new ApiError(data.error || 'Algo deu errado.', res.status);
  }
  return data;
}
