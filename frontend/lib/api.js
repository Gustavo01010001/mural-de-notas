// Única porta de saída do front para o back.
// O front só envia o que o usuário digitou e mostra o que o back responder.
// Sem NEXT_PUBLIC_API_URL, usa o mesmo endereço de onde a página foi aberta, na porta 4000.
// Assim funciona tanto em http://localhost:3000 quanto pelo IP da rede (ex.: celular em http://192.168.0.10:3000).
function resolveApiUrl() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== 'undefined') return `${window.location.protocol}//${window.location.hostname}:4000/api`;
  return 'http://localhost:4000/api';
}

const API_URL = resolveApiUrl();
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
}

export function userTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
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
