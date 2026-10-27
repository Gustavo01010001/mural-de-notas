import { NoteModel } from '../models/noteModel.js';
import { nextOccurrence, todayIn } from '../utils/dates.js';

// Acrescenta à nota a contagem regressiva até a data importante
export function withCountdown(note, today) {
  const occ = nextOccurrence(note.eventDate, note.repeatYearly, today);
  return {
    ...note,
    daysUntil: occ ? occ.daysUntil : null,
    years: occ ? occ.years : null,
    isToday: occ?.daysUntil === 0,
  };
}

/**
 * Alertas do dia: notas cuja data importante é hoje e que o usuário
 * ainda não fechou hoje. Também devolve as próximas (até 7 dias).
 */
export function getAlerts(userId, tz) {
  const today = todayIn(tz);
  const notes = NoteModel.listWithDates(userId).map((n) => withCountdown(n, today));

  const alerts = notes.filter((n) => n.isToday && n.dismissedOn !== today);
  const upcoming = notes
    .filter((n) => n.daysUntil !== null && n.daysUntil > 0 && n.daysUntil <= 7)
    .sort((a, b) => a.daysUntil - b.daysUntil);

  return { today, alerts, upcoming };
}
