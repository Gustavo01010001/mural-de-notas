import { NoteModel } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';
import { currentDueKey, getAlerts, withCountdown } from '../services/alertService.js';
import { HttpError } from '../utils/httpError.js';
import { isValidDate, monthRange, occurrencesBetween, todayIn } from '../utils/dates.js';
import { parseId } from '../utils/validators.js';

export const AlertController = {
  today(req, res) {
    res.json(getAlerts(req.user.id, req.query.tz));
  },

  // Usuário viu o alerta: aquele aviso ("dia:etapa") não aparece mais
  dismiss(req, res) {
    const id = parseId(req.params.id);
    const key = String(req.body?.key ?? currentDueKey(req.query.tz));
    if (!/^\d{4}-\d{2}-\d{2}:(soon|due)$/.test(key) || !isValidDate(key.slice(0, 10))) {
      throw new HttpError(400, 'Alerta inválido.');
    }
    const note = NoteModel.dismiss(req.user.id, id, key);
    if (!note) throw new HttpError(404, 'Post-it não encontrado.');
    res.json({ message: 'Alerta fechado.' });
  },

  // GET /calendar?month=2026-10 → em quais dias do mês há post-its com data
  calendar(req, res) {
    const month = String(req.query.month ?? todayIn(req.query.tz).slice(0, 7));
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new HttpError(400, 'Mês inválido (use AAAA-MM).');
    const { from, to } = monthRange(month);
    const today = todayIn(req.query.tz);

    const shared = FolderModel.sharedFolderIds(req.user.id);
    const folders = new Map(
      [...FolderModel.listByUser(req.user.id), ...FolderModel.listSharedWith(req.user.id)].map((f) => [f.id, f]),
    );

    const days = {};
    for (const note of NoteModel.listDatedVisible(req.user.id, shared)) {
      const n = withCountdown(note, today);
      const folder = n.folderId ? folders.get(n.folderId) : null;
      for (const date of occurrencesBetween(n.eventDate, n.repeat, from, to)) {
        (days[date] ??= []).push({
          id: n.id,
          title: n.title,
          color: n.color,
          eventType: n.eventType,
          eventTime: n.eventTime,
          repeat: n.repeat,
          folderId: n.folderId,
          folderName: folder?.name ?? 'Mural geral',
          folderIcon: folder?.icon ?? '📌',
          status: n.status,
          years: n.eventType === 'birthday' ? Number(date.slice(0, 4)) - Number(n.eventDate.slice(0, 4)) || null : null,
        });
      }
    }
    for (const list of Object.values(days)) list.sort((a, b) => (a.eventTime ?? '').localeCompare(b.eventTime ?? ''));
    res.json({ month, today, days });
  },
};
