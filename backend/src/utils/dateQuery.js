// Entende datas escritas na busca: "outubro", "outubro 2027", "25/12", "25/12/2026", "hoje", "amanhã"
import { addDays, isValidDate, monthRange } from './dates.js';

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MONTH_LABELS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n) => String(n).padStart(2, '0');

/** Recebe as palavras já normalizadas (sem acento) e separa o que é data do que é texto. */
export function parseDateTerms(terms, today) {
  const rest = [];
  let range = null;
  let label = null;
  const year = Number(today.slice(0, 4));

  for (let i = 0; i < terms.length; i++) {
    const t = terms[i];
    const month = MONTHS.indexOf(t);
    let m;
    if (t === 'hoje') {
      range = { from: today, to: today };
      label = 'hoje';
    } else if (t === 'amanha') {
      const d = addDays(today, 1);
      range = { from: d, to: d };
      label = 'amanhã';
    } else if (month !== -1) {
      const nextIsYear = /^\d{4}$/.test(terms[i + 1] ?? '');
      const y = nextIsYear ? Number(terms[++i]) : year;
      range = monthRange(`${y}-${pad(month + 1)}`);
      label = `${MONTH_LABELS[month]} de ${y}`;
    } else if ((m = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(t))) {
      const d = `${m[3] ?? year}-${pad(m[2])}-${pad(m[1])}`;
      if (isValidDate(d)) {
        range = { from: d, to: d };
        label = `${pad(m[1])}/${pad(m[2])}${m[3] ? `/${m[3]}` : ''}`;
      } else rest.push(t);
    } else {
      rest.push(t);
    }
  }
  return { terms: rest, range, label };
}
