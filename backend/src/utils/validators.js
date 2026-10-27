import { HttpError } from './httpError.js';
import { isValidDate } from './dates.js';

export const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'orange', 'purple'];
export const EVENT_TYPES = ['birthday', 'event', 'reminder'];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateRegister(body = {}) {
  const name = String(body.name ?? '').trim();
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');

  if (name.length < 2) throw new HttpError(400, 'Informe seu nome (mínimo 2 letras).');
  if (name.length > 60) throw new HttpError(400, 'Nome muito longo.');
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'E-mail inválido.');
  if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');

  return { name, email, password };
}

export function validateLogin(body = {}) {
  const email = String(body.email ?? '').trim().toLowerCase();
  const password = String(body.password ?? '');
  if (!email || !password) throw new HttpError(400, 'Informe e-mail e senha.');
  return { email, password };
}

export function validateNote(body = {}) {
  const title = String(body.title ?? '').trim();
  const content = String(body.content ?? '').trim();
  const color = NOTE_COLORS.includes(body.color) ? body.color : 'yellow';

  if (!title) throw new HttpError(400, 'O post-it precisa de um título.');
  if (title.length > 80) throw new HttpError(400, 'Título muito longo (máx. 80).');
  if (content.length > 1000) throw new HttpError(400, 'Texto muito longo (máx. 1000).');

  let eventDate = body.eventDate ? String(body.eventDate) : null;
  let eventType = null;
  let repeatYearly = false;

  if (eventDate) {
    if (!isValidDate(eventDate)) throw new HttpError(400, 'Data importante inválida.');
    eventType = EVENT_TYPES.includes(body.eventType) ? body.eventType : 'event';
    // Aniversário sempre se repete todo ano
    repeatYearly = eventType === 'birthday' ? true : Boolean(body.repeatYearly);
  }

  return { title, content, color, eventDate, eventType, repeatYearly };
}

export function validatePosition(body = {}) {
  const x = Number(body.x);
  const y = Number(body.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new HttpError(400, 'Posição inválida.');
  return {
    x: Math.max(0, Math.min(x, 20000)),
    y: Math.max(0, Math.min(y, 20000)),
    bringToFront: Boolean(body.bringToFront),
  };
}

export const BACKGROUND_MODES = [
  'auto',
  'neutral',
  'clear',
  'dry',
  'humid',
  'cloudy',
  'rain',
  'storm',
  'snow',
  'fog',
];

// Aceita só chaves conhecidas com valores válidos; o resto é ignorado
export function validateSettings(body = {}, current) {
  const next = { ...current };
  const bools = ['showWeather', 'showSeconds', 'clock24h', 'showUpcoming', 'dynamicBackground', 'calmMode', 'softNotes'];
  for (const key of bools) {
    if (key in body) {
      if (typeof body[key] !== 'boolean') throw new HttpError(400, `Valor inválido para ${key}.`);
      next[key] = body[key];
    }
  }
  const enums = {
    tempUnit: ['C', 'F'],
    backgroundMode: BACKGROUND_MODES,
    effectsIntensity: ['low', 'medium', 'high'],
    defaultColor: NOTE_COLORS,
    warmFilter: ['off', 'low', 'high'],
    mobileLayout: ['grid', 'free'], // no celular: grade organizada ou mural livre
    autoCalmAfter: [0, 30, 60, 120], // minutos de uso até ligar o modo confortável sozinho
  };
  for (const [key, allowed] of Object.entries(enums)) {
    if (key in body) {
      if (!allowed.includes(body[key])) throw new HttpError(400, `Valor inválido para ${key}.`);
      next[key] = body[key];
    }
  }
  if ('bgDim' in body) {
    const dim = body.bgDim;
    if (!Number.isInteger(dim) || dim < 0 || dim > 70) throw new HttpError(400, 'Valor inválido para bgDim.');
    next.bgDim = dim;
  }
  return next;
}

export function validateName(body = {}) {
  const name = String(body.name ?? '').trim();
  if (name.length < 2) throw new HttpError(400, 'Informe seu nome (mínimo 2 letras).');
  if (name.length > 60) throw new HttpError(400, 'Nome muito longo.');
  return name;
}

export const FOLDER_ICONS = ['📁', '💼', '📚', '💡', '✈️', '🍳', '🏠', '❤️', '🎯', '🎮', '🎵', '🛒', '💰', '🏋️', '🧠', '⭐'];

export function validateFolder(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpError(400, 'Dê um nome para a pasta.');
  if (name.length > 40) throw new HttpError(400, 'Nome da pasta muito longo (máx. 40).');
  return {
    name,
    icon: FOLDER_ICONS.includes(body.icon) ? body.icon : '📁',
    color: NOTE_COLORS.includes(body.color) ? body.color : 'yellow',
  };
}

// "root", vazio ou null = Mural geral; senão o id da pasta
export function parseFolderId(value) {
  if (value === undefined || value === null || value === '' || value === 'root') return null;
  return parseId(value);
}

export function parseId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'ID inválido.');
  return id;
}
