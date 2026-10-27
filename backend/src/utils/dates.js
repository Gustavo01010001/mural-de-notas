const DEFAULT_TZ = 'America/Sao_Paulo';

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

function toUTC(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function isValidDate(ymd) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/**
 * Quantos dias faltam para a próxima ocorrência da data.
 * Retorna null se a data (não anual) já passou.
 * Para datas anuais também calcula quantos anos a pessoa/evento completa.
 */
export function nextOccurrence(eventDate, repeatYearly, today) {
  if (!eventDate) return null;
  const todayMs = toUTC(today);
  const [ey, em, ed] = eventDate.split('-').map(Number);

  if (!repeatYearly) {
    const diff = Math.round((toUTC(eventDate) - todayMs) / 86_400_000);
    return diff < 0 ? null : { daysUntil: diff, years: null };
  }

  let year = Number(today.slice(0, 4));
  let occ = Date.UTC(year, em - 1, ed);
  if (occ < todayMs) {
    year += 1;
    occ = Date.UTC(year, em - 1, ed);
  }
  const years = year - ey;
  return { daysUntil: Math.round((occ - todayMs) / 86_400_000), years: years > 0 ? years : null };
}
