import { folderAccess } from '../services/accessService.js';
import { live } from '../services/liveService.js';
import { HttpError } from '../utils/httpError.js';

export const LiveController = {
  // GET /live/folders/:id — conexão aberta (SSE) com presença, cursores e mudanças
  stream(req, res) {
    const access = folderAccess(req.user.id, req.params.id);
    if (!access.folder) throw new HttpError(400, 'O "ao vivo" é só para pastas.');
    live.subscribe(access.folderId, req.user, req, res);
  },

  // POST /live/folders/:id/cursor { x, y } — posição do meu cursor no mural (coordenadas do mural)
  cursor(req, res) {
    const access = folderAccess(req.user.id, req.params.id);
    const x = Number(req.body?.x);
    const y = Number(req.body?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < -500 || y < -500 || x > 30000 || y > 30000) {
      throw new HttpError(400, 'Posição inválida.');
    }
    live.cursor(access.folderId, req.user.id, { x: Math.round(x), y: Math.round(y) });
    res.status(204).end();
  },
};
