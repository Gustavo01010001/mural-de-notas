const DEFAULT_TZ = 'America/Sao_Paulo';
const DAY = 86_400_000;

export const REPEATS = ['none', 'weekly', 'monthly', 'yearly'];

export function safeTimeZone(tz) {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

// "Hoje" no fuso horário do usuário, no formato YYYY-MM-DD
export function todayIn(tz) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(tz),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Agora no fuso do usuário: data + minutos desde a meia-noite
export function nowIn(tz, at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: safeTimeZone(tz),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) };
}

const toUTC = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
export const dayNumber = (ymd) => Math.round(toUTC(ymd) / DAY);
export const fromDayNumber = (n) => new Date(n * DAY).toISOString().slice(0, 10);
export const addDays = (ymd, n) => fromDayNumber(dayNumber(ymd) + n);
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
const ymd = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

export function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const isValidTime = (value) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value ?? '');
export const timeToMinutes = (hhmm) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : 0);

// Aceita o formato antigo (true/false = anual ou não)
const normalizeRepeat = (repeat) => (repeat === true ? 'yearly' : repeat === false || !repeat ? 'none' : repeat);

// Dia "d" no mês, sem passar do último dia (dia 31 em fevereiro vira 28/29)
const clampDay = (y, m, d) => ymd(y, m, Math.min(d, daysInMonth(y, m)));

/**
 * Primeira ocorrência na data `from` ou depois dela.
 * - none: a própria data (se ainda não passou)
 * - weekly: mesmo dia da semana; monthly: mesmo dia do mês; yearly: mesmo dia e mês
 * Repetições só começam a contar a partir da data original.
 */
export function occurrenceOnOrAfter(eventDate, repeatRaw, from) {
  const repeat = normalizeRepeat(repeatRaw);
  if (!eventDate) return null;
  const start = dayNumber(eventDate) > dayNumber(from) ? eventDate : from;
  const [ey, em, ed] = eventDate.split('-').map(Number);

  if (repeat === 'none') return dayNumber(eventDate) >= dayNumber(from) ? eventDate : null;

  if (repeat === 'weekly') {
    const diff = (((dayNumber(eventDate) - dayNumber(start)) % 7) + 7) % 7;
    return addDays(start, diff);
  }

  const [sy, sm] = start.split('-').map(Number);
  if (repeat === 'monthly') {
    let y = sy;
    let m = sm;
    for (let i = 0; i < 2; i++) {
      const c = clampDay(y, m, ed);
      if (dayNumber(c) >= dayNumber(start)) return c;
      m = m === 12 ? 1 : m + 1;
      if (m === 1) y++;
    }
    return null;
  }

  // yearly
  for (let y = sy; y <= sy + 1; y++) {
    const c = clampDay(y, em, ed);
    if (dayNumber(c) >= dayNumber(start)) return c;
  }
  return null;
}

/**
 * Próxima ocorrência a partir de hoje: quantos dias faltam e (anual) quantos anos completa.
 * Retorna null se a data (não repetida) já passou.
 */
export function nextOccurrence(eventDate, repeat, today) {
  const date = occurrenceOnOrAfter(eventDate, repeat, today);
  if (!date) return null;
  const years = normalizeRepeat(repeat) === 'yearly' ? Number(date.slice(0, 4)) - Number(eventDate.slice(0, 4)) : 0;
  return { date, daysUntil: dayNumber(date) - dayNumber(today), years: years > 0 ? years : null };
}

/** Todas as ocorrências entre `from` e `to` (inclusive) — usado no calendário e na busca por data. */
export function occurrencesBetween(eventDate, repeat, from, to) {
  const out = [];
  let cursor = from;
  for (let guard = 0; guard < 400; guard++) {
    const occ = occurrenceOnOrAfter(eventDate, repeat, cursor);
    if (!occ || dayNumber(occ) > dayNumber(to)) break;
    out.push(occ);
    if (normalizeRepeat(repeat) === 'none') break;
    cursor = addDays(occ, 1);
  }
  return out;
}

export function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  return { from: ymd(y, m, 1), to: ymd(y, m, daysInMonth(y, m)) };
}
