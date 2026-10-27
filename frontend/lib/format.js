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

export const eventIcon = (type) => EVENT_TYPES.find((t) => t.id === type)?.icon ?? '📌';

export function formatEventDate(note) {
  if (!note.eventDate) return '';
  const [y, m, d] = note.eventDate.split('-');
  return note.repeatYearly ? `${d}/${m}` : `${d}/${m}/${y}`;
}

export function countdownLabel(note) {
  if (!note.eventDate) return null;
  if (note.isToday) return note.eventType === 'birthday' ? 'É HOJE! 🎉' : 'É hoje!';
  if (note.daysUntil === 1) return 'Amanhã';
  if (note.daysUntil != null) return `Faltam ${note.daysUntil} dias`;
  return 'Já passou';
}

export function alertHeadline(note) {
  if (note.eventType === 'birthday') return 'Hoje é dia de aniversário!';
  if (note.eventType === 'reminder') return 'Lembrete para hoje!';
  return 'Chegou o grande dia!';
}
