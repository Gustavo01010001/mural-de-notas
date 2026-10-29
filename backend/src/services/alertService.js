import { NoteModel } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';
import { nextOccurrence, nowIn, timeToMinutes, todayIn } from '../utils/dates.js';
import { minutesUntil, reminderStage } from '../utils/reminders.js';

// Acrescenta à nota a contagem regressiva até a próxima ocorrência da data importante
export function withCountdown(note, today) {
  const occ = nextOccurrence(note.eventDate, note.repeat, today);
  return {
    ...note,
    nextDate: occ?.date ?? null,
    daysUntil: occ ? occ.daysUntil : null,
    years: occ ? occ.years : null,
    isToday: occ?.daysUntil === 0,
  };
}

/**
 * Alertas de agora (que o usuário ainda não fechou) e próximas datas (até 7 dias).
 * Inclui as datas das pastas compartilhadas comigo: em grupo, todo mundo precisa do lembrete.
 */
export function getAlerts(userId, tz) {
  const now = nowIn(tz);
  const shared = FolderModel.sharedFolderIds(userId);
  const visible = NoteModel.listDatedVisible(userId, shared);
  // nos post-its do grupo, cada convidado fecha o próprio aviso (não fecha para todo mundo)
  const memberKeys = NoteModel.memberDismissed(userId, visible.filter((n) => n.ownerId !== userId).map((n) => n.id));
  const notes = visible.map((n) =>
    withCountdown(n.ownerId === userId ? n : { ...n, dismissed: memberKeys.get(n.id) ?? [], fromShared: true }, now.date),
  );

  const alerts = [];
  const upcoming = [];
  for (const n of notes) {
    const stage = reminderStage(n, now);
    const key = stage ? `${n.nextDate}:${stage}` : null;
    if (stage && !n.dismissed.includes(key)) {
      alerts.push({ ...n, alertStage: stage, alertKey: key, minutesUntil: minutesUntil(n, now) });
    } else if (n.daysUntil !== null && n.daysUntil <= 7 && !(n.daysUntil === 0 && stage === 'due')) {
      upcoming.push(n);
    }
  }
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil || timeToMinutes(a.eventTime) - timeToMinutes(b.eventTime));
  alerts.sort((a, b) => a.minutesUntil - b.minutesUntil);
  return { today: now.date, now: now.minutes, alerts, upcoming };
}

export const currentDueKey = (tz) => `${todayIn(tz)}:due`;
