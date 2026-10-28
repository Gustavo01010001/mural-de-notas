import { FolderModel } from '../models/folderModel.js';
import { NoteModel } from '../models/noteModel.js';
import { HttpError } from '../utils/httpError.js';
import { parseId, validateFolder } from '../utils/validators.js';

function ensureUniqueName(userId, name, exceptId = null) {
  const found = FolderModel.findByName(userId, name);
  if (found && found.id !== exceptId) throw new HttpError(409, `Você já tem uma pasta chamada "${name}".`);
}

export const FolderController = {
  list(req, res) {
    const special = NoteModel.countSpecial(req.user.id);
    res.json({
      folders: FolderModel.listByUser(req.user.id),
      rootCount: FolderModel.countRoot(req.user.id),
      archivedCount: special.archived ?? 0,
      trashCount: special.trash ?? 0,
    });
  },

  create(req, res) {
    const data = validateFolder(req.body);
    ensureUniqueName(req.user.id, data.name);
    res.status(201).json({ message: `Pasta "${data.name}" criada!`, folder: FolderModel.create(req.user.id, data) });
  },

  update(req, res) {
    const id = parseId(req.params.id);
    if (!FolderModel.findById(req.user.id, id)) throw new HttpError(404, 'Pasta não encontrada.');
    const data = validateFolder(req.body);
    ensureUniqueName(req.user.id, data.name, id);
    res.json({ message: 'Pasta atualizada!', folder: FolderModel.update(req.user.id, id, data) });
  },

  remove(req, res) {
    const id = parseId(req.params.id);
    if (!FolderModel.remove(req.user.id, id)) throw new HttpError(404, 'Pasta não encontrada.');
    res.json({ message: 'Pasta apagada. Os post-its dela foram para o Mural geral.' });
  },
};
