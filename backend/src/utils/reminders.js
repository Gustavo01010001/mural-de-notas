import { dayNumber, timeToMinutes } from './dates.js';

/**
 * Em que "etapa" o lembrete está agora:
 * - 'soon': já entrou no aviso antecipado ("1 dia antes", "15 min antes"...)
 * - 'due':  chegou o dia (sem horário) ou a hora (com horário)
 * - null:   ainda não é hora de avisar
 * `note.nextDate` é a próxima ocorrência (já calculada) e `now` vem de nowIn(tz).
 */
export function reminderStage(note, now) {
  if (!note.nextDate) return null;
  const minuteNow = dayNumber(now.date) * 1440 + now.minutes;
  const start = dayNumber(note.nextDate) * 1440 + timeToMinutes(note.eventTime);
  if (note.nextDate === now.date && minuteNow >= start) return 'due';
  if (note.remindBefore > 0 && minuteNow >= start - note.remindBefore && minuteNow < start) return 'soon';
  return null;
}

export const minutesUntil = (note, now) =>
  dayNumber(note.nextDate) * 1440 + timeToMinutes(note.eventTime) - (dayNumber(now.date) * 1440 + now.minutes);
