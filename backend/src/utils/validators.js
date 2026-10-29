import { HttpError } from './httpError.js';
import { isValidDate, isValidTime, REPEATS } from './dates.js';
import { normalizePublicCode } from './publicCode.js';

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

  const checklist = validateChecklist(body.checklist);
  const tags = validateTags(body.tags);

  const eventDate = body.eventDate ? String(body.eventDate) : null;
  let eventType = null;
  let eventTime = null;
  let remindBefore = 0;
  let repeat = 'none';

  if (eventDate) {
    if (!isValidDate(eventDate)) throw new HttpError(400, 'Data importante inválida.');
    eventType = EVENT_TYPES.includes(body.eventType) ? body.eventType : 'event';

    if (body.eventTime) {
      if (!isValidTime(String(body.eventTime))) throw new HttpError(400, 'Horário inválido (use HH:MM).');
      eventTime = String(body.eventTime);
    }

    const before = Number(body.remindBefore ?? 0);
    if (!REMIND_OPTIONS.includes(before)) throw new HttpError(400, 'Aviso antecipado inválido.');
    remindBefore = before;

    // "repeat" novo; "repeatYearly" é o formato antigo (continua aceito)
    repeat = body.repeat ?? (body.repeatYearly ? 'yearly' : 'none');
    if (!REPEATS.includes(repeat)) throw new HttpError(400, 'Repetição inválida.');
    if (eventType === 'birthday') repeat = 'yearly'; // aniversário sempre se repete todo ano
  }

  return { title, content, color, checklist, tags, eventDate, eventType, eventTime, remindBefore, repeat };
}

// Aviso antecipado (minutos): na hora, 15 min, 30 min, 1 h, 2 h, 1 dia, 2 dias, 1 semana
export const REMIND_OPTIONS = [0, 15, 30, 60, 120, 1440, 2880, 10080];

const MAX_CHECK_ITEMS = 30;
const MAX_TAGS = 6;

export function validateChecklist(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, 'Checklist inválida.');
  if (raw.length > MAX_CHECK_ITEMS) throw new HttpError(400, `A checklist pode ter no máximo ${MAX_CHECK_ITEMS} itens.`);
  return raw
    .map((item, i) => {
      const text = String(item?.text ?? '').trim();
      if (text.length > 120) throw new HttpError(400, 'Item da checklist muito longo (máx. 120).');
      const id = /^[a-z0-9-]{1,40}$/i.test(item?.id ?? '') ? item.id : `i${Date.now().toString(36)}${i}`;
      return { id, text, done: Boolean(item?.done) };
    })
    .filter((item) => item.text);
}

// Etiquetas: minúsculas, sem "#", só letras/números/-/_ (acentos permitidos)
export function validateTags(raw) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) throw new HttpError(400, 'Etiquetas inválidas.');
  const tags = [];
  for (const t of raw) {
    const tag = String(t ?? '')
      .trim()
      .replace(/^#+/, '')
      .toLowerCase()
      .replace(/\s+/g, '-');
    if (!tag) continue;
    if (tag.length > 20 || !/^[\p{L}\p{N}_-]+$/u.test(tag)) {
      throw new HttpError(400, `Etiqueta inválida: "${String(t).slice(0, 25)}". Use letras, números, - ou _ (máx. 20).`);
    }
    if (!tags.includes(tag)) tags.push(tag);
  }
  if (tags.length > MAX_TAGS) throw new HttpError(400, `No máximo ${MAX_TAGS} etiquetas por post-it.`);
  return tags;
}

export function validateSize(body = {}) {
  const width = Number(body.width);
  const height = Number(body.height);
  if (!Number.isFinite(width) || !Number.isFinite(height)) throw new HttpError(400, 'Tamanho inválido.');
  return {
    width: Math.round(Math.min(Math.max(width, 160), 520)),
    height: Math.round(Math.min(Math.max(height, 140), 640)),
  };
}

// Foto: chega como "data:image/...;base64,..." (o front já reduz para ~1000px)
const IMAGE_TYPES = {
  'image/jpeg': (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  'image/png': (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  'image/webp': (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP',
};
export const MAX_IMAGE_BYTES = 1.5 * 1024 * 1024;

export function validateImage(body = {}) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(body.dataUrl ?? ''));
  if (!m) throw new HttpError(400, 'Envie uma imagem JPG, PNG ou WEBP.');
  const data = Buffer.from(m[2], 'base64');
  if (data.length > MAX_IMAGE_BYTES) throw new HttpError(413, 'Imagem muito grande (máx. 1,5 MB).');
  // confere o conteúdo de verdade, não só o que o nome diz
  if (!IMAGE_TYPES[m[1]](data)) throw new HttpError(400, 'O arquivo não é uma imagem válida.');
  return { mime: m[1], data };
}

export function validateBatch(body = {}) {
  const ids = Array.isArray(body.ids) ? [...new Set(body.ids.map(Number))] : [];
  if (!ids.length || ids.length > 200 || !ids.every((id) => Number.isInteger(id) && id > 0)) {
    throw new HttpError(400, 'Selecione de 1 a 200 post-its.');
  }
  const action = body.action;
  if (!['move', 'archive', 'delete', 'pin', 'unpin'].includes(action)) throw new HttpError(400, 'Ação inválida.');
  return { ids, action };
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
  const bools = ['showWeather', 'showSeconds', 'clock24h', 'showUpcoming', 'dynamicBackground', 'calmMode', 'softNotes', 'highContrast', 'sounds', 'showFocusTimer'];
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
    theme: ['dark', 'light', 'auto'], // fundo preto, claro ou seguir o celular/PC
    fontScale: [1, 1.15, 1.3, 1.5], // tamanho da letra
    soundVolume: [0.3, 0.6, 1],
    focusMinutes: [15, 25, 45, 50], // modo foco (Pomodoro)
    breakMinutes: [5, 10, 15],
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

export const FOLDER_ICONS = ['📁', '💼', '📚', '🎓', '📝', '💡', '✈️', '🍳', '🏠', '❤️', '🎯', '🎮', '🎵', '🛒', '💰', '🏋️', '🧠', '⭐'];

// Um emoji só (aceita tom de pele e emojis compostos, como 👩‍💻)
const ONE_EMOJI = /^\p{Extended_Pictographic}(?:️|[\u{1F3FB}-\u{1F3FF}]|‍\p{Extended_Pictographic}️?)*$/u;

function validateFolderIcon(icon) {
  if (icon === undefined || icon === null || icon === '') return '📁';
  const value = String(icon).trim();
  if (value.length > 16 || !ONE_EMOJI.test(value)) throw new HttpError(400, 'O ícone da pasta precisa ser um emoji (ex.: 📚 ou 🎓).');
  return value;
}

export function validateFolder(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) throw new HttpError(400, 'Dê um nome para a pasta.');
  if (name.length > 40) throw new HttpError(400, 'Nome da pasta muito longo (máx. 40).');
  return {
    name,
    icon: validateFolderIcon(body.icon),
    color: NOTE_COLORS.includes(body.color) ? body.color : 'yellow',
    // subpasta de... (null = pasta principal)
    parentId: parseFolderId(body.parentId),
  };
}

export function validateReorder(body = {}) {
  const ids = Array.isArray(body.ids) ? body.ids.map(Number) : [];
  if (!ids.length || ids.length > 200 || !ids.every((id) => Number.isInteger(id) && id > 0) || new Set(ids).size !== ids.length) {
    throw new HttpError(400, 'Ordem inválida.');
  }
  return { parentId: parseFolderId(body.parentId), ids };
}

export function validateInviteEmail(body = {}) {
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw new HttpError(400, 'Digite um e-mail válido.');
  return email;
}

// Convite: a pessoa digita o ID (ex.: K7P2-9QXM) ou o e-mail no mesmo campo ("who")
export function validateInvite(body = {}) {
  const who = String(body.who ?? body.code ?? body.email ?? '').trim();
  if (who.includes('@')) return { email: validateInviteEmail({ email: who }) };
  const code = normalizePublicCode(who);
  if (!code) throw new HttpError(400, 'Digite o ID da pessoa (ex.: K7P2-9QXM) ou o e-mail dela.');
  return { code };
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
