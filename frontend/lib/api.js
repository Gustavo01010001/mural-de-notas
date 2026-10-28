// Única porta de saída do front para o back.
// O front só envia o que o usuário digitou e mostra o que o back responder.
// Por padrão chama "/api" no mesmo endereço da página; o Next repassa para o backend
// (ver rewrites em next.config.mjs). Funciona em localhost, pelo IP da rede e com HTTPS.
const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';
const TOKEN_KEY = 'mural_token';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

export function clearToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  // ao sair, esquece as fotos carregadas nesta aba
  for (const url of imageCache.values()) URL.revokeObjectURL(url);
  imageCache.clear();
}

export function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

// Baixa a foto de um post-it (precisa do token) e devolve um endereço local para o <img>
const imageCache = new Map();
export async function noteImageUrl(noteId, version) {
  const key = `${noteId}:${version}`;
  if (imageCache.has(key)) return imageCache.get(key);
  const res = await fetch(`${API_URL}/notes/${noteId}/image`, {
    headers: { Authorization: `Bearer ${getToken()}` },
    cache: 'no-store',
  });
  if (!res.ok) throw new ApiError('Foto indisponível.', res.status);
  const url = URL.createObjectURL(await res.blob());
  imageCache.set(key, url);
  return url;
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  // O fuso vai junto para o back saber qual é o "hoje" do usuário
  const sep = path.includes('?') ? '&' : '?';
  const url = `${API_URL}${path}${sep}tz=${encodeURIComponent(userTimeZone())}`;

  let res;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Não consegui falar com o servidor. O backend está rodando?', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearToken();
    throw new ApiError(data.error || 'Algo deu errado.', res.status);
  }
  return data;
}
