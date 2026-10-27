import { NoteModel } from '../models/noteModel.js';
import { getAlerts } from '../services/alertService.js';
import { HttpError } from '../utils/httpError.js';
import { todayIn } from '../utils/dates.js';
import { parseId } from '../utils/validators.js';

export const AlertController = {
  today(req, res) {
    res.json(getAlerts(req.user.id, req.query.tz));
  },

  // Usuário viu o alerta: não mostrar de novo hoje
  dismiss(req, res) {
    const id = parseId(req.params.id);
    const note = NoteModel.dismiss(req.user.id, id, todayIn(req.query.tz));
    if (!note) throw new HttpError(404, 'Post-it não encontrado.');
    res.json({ message: 'Alerta fechado.' });
  },
};
