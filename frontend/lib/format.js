export const COLORS = [
  { id: 'yellow', label: 'Amarelo' },
  { id: 'pink', label: 'Rosa' },
  { id: 'blue', label: 'Azul' },
  { id: 'green', label: 'Verde' },
  { id: 'orange', label: 'Laranja' },
  { id: 'purple', label: 'Lilás' },
];

export const EVENT_TYPES = [
  { id: 'birthday', label: 'Aniversário', icon: '🎂' },
  { id: 'event', label: 'Evento', icon: '📅' },
  { id: 'reminder', label: 'Lembrete', icon: '⏰' },
];

export const REPEAT_OPTIONS = [
  { id: 'none', label: 'Não repetir' },
  { id: 'weekly', label: 'Toda semana' },
  { id: 'monthly', label: 'Todo mês' },
  { id: 'yearly', label: 'Todo ano' },
];

export const REMIND_OPTIONS = [
  { id: 0, label: 'Na hora' },
  { id: 15, label: '15 min antes' },
  { id: 30, label: '30 min antes' },
  { id: 60, label: '1 hora antes' },
  { id: 120, label: '2 horas antes' },
  { id: 1440, label: '1 dia antes' },
  { id: 2880, label: '2 dias antes' },
  { id: 10080, label: '1 semana antes' },
];

export const eventIcon = (type) => EVENT_TYPES.find((t) => t.id === type)?.icon ?? '📌';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const weekdayOf = (ymd) => WEEKDAYS[new Date(`${ymd}T12:00:00Z`).getUTCDay()];

export function repeatLabel(note) {
  const d = note.eventDate?.slice(8, 10);
  switch (note.repeat) {
    case 'weekly':
      return `toda ${weekdayOf(note.eventDate)}`.replace('toda sábado', 'todo sábado').replace('toda domingo', 'todo domingo');
    case 'monthly':
      return `todo dia ${Number(d)}`;
    case 'yearly':
      return 'todo ano';
    default:
      return '';
  }
}

export function formatEventDate(note) {
  if (!note.eventDate) return '';
  const [y, m, d] = note.eventDate.split('-');
  const date = note.repeat === 'yearly' ? `${d}/${m}` : note.repeat === 'none' || !note.repeat ? `${d}/${m}/${y}` : '';
  const time = note.eventTime ? ` às ${note.eventTime}` : '';
  return `${date}${time}`.trim();
}

export function countdownLabel(note) {
  if (!note.eventDate) return null;
  const at = note.eventTime ? ` às ${note.eventTime}` : '';
  if (note.isToday) {
    if (note.eventType === 'birthday') return 'É HOJE! 🎉';
    return note.eventTime ? `Hoje${at}` : 'É hoje!';
  }
  if (note.daysUntil === 1) return `Amanhã${at}`;
  if (note.daysUntil != null) return `Faltam ${note.daysUntil} dias`;
  return 'Já passou';
}

export function alertHeadline(note) {
  if (note.alertStage === 'soon') {
    const m = note.minutesUntil ?? 0;
    const when =
      m >= 1440 ? `Daqui a ${Math.round(m / 1440)} dia${Math.round(m / 1440) === 1 ? '' : 's'}` : m >= 60 ? `Daqui a ${Math.round(m / 60)} h` : `Daqui a ${Math.max(1, m)} min`;
    return `${when}${note.eventTime ? ` (${note.eventTime})` : ''}`;
  }
  if (note.eventType === 'birthday') return 'Hoje é dia de aniversário!';
  if (note.eventTime) return `Agora: ${note.eventTime}`;
  if (note.eventType === 'reminder') return 'Lembrete para hoje!';
  return 'Chegou o grande dia!';
}

// ----- Google Agenda -----
const RRULE = { weekly: 'RRULE:FREQ=WEEKLY', monthly: 'RRULE:FREQ=MONTHLY', yearly: 'RRULE:FREQ=YEARLY' };
const compact = (ymd) => ymd.replaceAll('-', '');
function plusDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Link "Adicionar ao Google Agenda" (abre o Google já com o evento preenchido). */
export function googleCalendarUrl(note) {
  if (!note.eventDate) return null;
  // para repetições, começa na próxima ocorrência
  const start = note.repeat && note.repeat !== 'none' && note.nextDate ? note.nextDate : note.eventDate;
  let dates;
  if (note.eventTime) {
    const [h, min] = note.eventTime.split(':').map(Number);
    const endH = String((h + 1) % 24).padStart(2, '0');
    const endDay = h === 23 ? plusDays(start, 1) : start;
    dates = `${compact(start)}T${note.eventTime.replace(':', '')}00/${compact(endDay)}T${endH}${String(min).padStart(2, '0')}00`;
  } else {
    dates = `${compact(start)}/${compact(plusDays(start, 1))}`; // dia inteiro
  }
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `${eventIcon(note.eventType)} ${note.title}`,
    dates,
    details: [note.content, ...(note.checklist ?? []).map((i) => `${i.done ? '☑' : '☐'} ${i.text}`), '', 'Criado no Mural de Notas']
      .filter((l) => l !== undefined)
      .join('\n')
      .trim(),
    ctz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  if (RRULE[note.repeat]) params.set('recur', RRULE[note.repeat]);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
