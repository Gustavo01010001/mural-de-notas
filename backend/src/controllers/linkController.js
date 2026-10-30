import { LINK_COLORS, LinkModel, MAX_LINKS_PER_FOLDER } from '../models/linkModel.js';
import { folderAccess, noteAccess } from '../services/accessService.js';
import { live } from '../services/liveService.js';
import { HttpError } from '../utils/httpError.js';
import { parseId } from '../utils/validators.js';

const linkColor = (value) => {
  if (value === undefined || value === null) return 'red';
  if (!LINK_COLORS.includes(value)) throw new HttpError(400, 'Cor de fio inválida.');
  return value;
};

// Conexões entre post-its (os "fios" do quadro de detetive)
export const LinkController = {
  // GET /links?folder=root|id
  list(req, res) {
    const access = folderAccess(req.user.id, req.query.folder);
    res.json({ links: LinkModel.listForFolder(access.ownerId, access.folderId) });
  },

  // POST /links { fromId, toId, color? }
  create(req, res) {
    const fromId = parseId(req.body?.fromId);
    const toId = parseId(req.body?.toId);
    if (fromId === toId) throw new HttpError(400, 'Escolha outro post-it para ligar.');
    const a = noteAccess(req.user.id, fromId);
    const b = noteAccess(req.user.id, toId);
    if (a.note.ownerId !== b.note.ownerId || a.note.folderId !== b.note.folderId) {
      throw new HttpError(400, 'Só dá para ligar post-its da mesma pasta.');
    }
    if (a.note.status !== 'active' || b.note.status !== 'active') throw new HttpError(400, 'Os dois post-its precisam estar no mural.');
    if (LinkModel.findBetween(fromId, toId)) throw new HttpError(409, 'Esses post-its já estão ligados.');
    if (LinkModel.countForFolder(a.ownerId, a.note.folderId) >= MAX_LINKS_PER_FOLDER) {
      throw new HttpError(400, `Limite de ${MAX_LINKS_PER_FOLDER} conexões por pasta.`);
    }
    const link = LinkModel.create(a.ownerId, fromId, toId, req.user.id, linkColor(req.body?.color));
    live.notify(a.note.folderId, req.user.id);
    res.status(201).json({ message: 'Post-its ligados! 🔗', link });
  },

  // PATCH /links/:id { color } — trocar a cor do fio
  update(req, res) {
    const link = LinkModel.findById(parseId(req.params.id));
    if (!link) throw new HttpError(404, 'Conexão não encontrada.');
    const { note } = noteAccess(req.user.id, link.fromId);
    const updated = LinkModel.setColor(link.id, linkColor(req.body?.color));
    live.notify(note.folderId, req.user.id);
    res.json({ link: updated });
  },

  // DELETE /links/:id
  remove(req, res) {
    const link = LinkModel.findById(parseId(req.params.id));
    if (!link) throw new HttpError(404, 'Conexão não encontrada.');
    const { note } = noteAccess(req.user.id, link.fromId, { allowTrash: true }); // 404 se não tenho acesso
    LinkModel.remove(link.id);
    live.notify(note.folderId, req.user.id);
    res.json({ message: 'Conexão removida.' });
  },
};
