import { FolderModel, MAX_DEPTH, MAX_MEMBERS } from '../models/folderModel.js';
import { NoteModel } from '../models/noteModel.js';
import { UserModel } from '../models/userModel.js';
import { folderAccess, ownFolderOr404 } from '../services/accessService.js';
import { live } from '../services/liveService.js';
import { HttpError } from '../utils/httpError.js';
import { parseId, validateFolder, validateInvite, validateReorder } from '../utils/validators.js';
import { hit } from '../utils/rateLimit.js';

function ensureUniqueName(userId, name, parentId, exceptId = null) {
  const found = FolderModel.findByName(userId, name, parentId);
  if (found && found.id !== exceptId) {
    throw new HttpError(409, `Já existe uma pasta chamada "${name}" ${parentId ? 'dentro desta pasta' : 'aqui'}.`);
  }
}

// Confere se dá para colocar a pasta (com as subpastas dela) dentro de parentId
function ensureValidParent(userId, parentId, movingId = null) {
  if (parentId === null) return;
  if (!FolderModel.findById(userId, parentId)) throw new HttpError(404, 'Pasta de destino não encontrada.');
  if (movingId && FolderModel.isDescendant(parentId, movingId)) {
    throw new HttpError(400, 'Uma pasta não pode ficar dentro dela mesma.');
  }
  const height = movingId ? FolderModel.subtreeHeight(movingId) : 1;
  if (FolderModel.depthOf(parentId) + height > MAX_DEPTH) {
    throw new HttpError(400, `Dá para criar no máximo ${MAX_DEPTH} níveis de pastas.`);
  }
}

export const FolderController = {
  list(req, res) {
    const special = NoteModel.countSpecial(req.user.id);
    res.json({
      folders: FolderModel.listByUser(req.user.id),
      shared: FolderModel.listSharedWith(req.user.id), // compartilhadas comigo
      rootCount: FolderModel.countRoot(req.user.id),
      archivedCount: special.archived ?? 0,
      trashCount: special.trash ?? 0,
    });
  },

  create(req, res) {
    const data = validateFolder(req.body);
    ensureValidParent(req.user.id, data.parentId);
    ensureUniqueName(req.user.id, data.name, data.parentId);
    const folder = FolderModel.create(req.user.id, data);
    res.status(201).json({ message: `Pasta "${data.name}" criada!`, folder });
  },

  update(req, res) {
    const { folder: current } = ownFolderOr404(req.user.id, req.params.id);
    const data = validateFolder(req.body);
    // sem "parentId" no pedido = continua onde está
    if (!('parentId' in (req.body ?? {}))) data.parentId = current.parentId;
    ensureValidParent(req.user.id, data.parentId, current.id);
    ensureUniqueName(req.user.id, data.name, data.parentId, current.id);
    const folder = FolderModel.update(req.user.id, current.id, data);
    live.notify(folder.id, req.user.id, 'folder');
    res.json({ message: 'Pasta atualizada!', folder });
  },

  // PUT /folders/order { parentId, ids } — nova ordem das pastas irmãs
  reorder(req, res) {
    const { parentId, ids } = validateReorder(req.body);
    const siblings = FolderModel.listByUser(req.user.id).filter((f) => f.parentId === parentId);
    if (ids.length !== siblings.length || !siblings.every((f) => ids.includes(f.id))) {
      throw new HttpError(400, 'A nova ordem precisa ter exatamente as pastas desse nível.');
    }
    FolderModel.reorder(req.user.id, parentId, ids);
    res.json({ message: 'Ordem das pastas salva.', folders: FolderModel.listByUser(req.user.id) });
  },

  remove(req, res) {
    const { folder } = ownFolderOr404(req.user.id, req.params.id);
    live.notify(folder.id, req.user.id, 'folder-removed');
    FolderModel.remove(req.user.id, folder.id);
    res.json({ message: 'Pasta apagada. Os post-its dela foram para o Mural geral e as subpastas subiram um nível.' });
  },

  // ----- compartilhamento -----
  members(req, res) {
    const access = folderAccess(req.user.id, req.params.id);
    if (!access.folder) throw new HttpError(404, 'Pasta não encontrada.');
    const owner = UserModel.findById(access.ownerId);
    // ninguém vê o e-mail de ninguém aqui: quem convidou pelo ID não precisa (nem deve) saber o e-mail
    const strip = (u) => ({ id: u.id, name: u.name, code: u.code ?? null });
    res.json({
      role: access.role,
      owner: strip(owner),
      members: FolderModel.members(access.folderId).map(strip),
    });
  },

  addMember(req, res) {
    const { folder } = ownFolderOr404(req.user.id, req.params.id);
    // muitos convites seguidos = alguém tentando adivinhar IDs
    hit(`invite:${req.user.id}`, { max: 30, windowMs: 10 * 60_000, message: 'Muitos convites seguidos. Espere alguns minutos e tente de novo.' });
    const { email, code } = validateInvite(req.body);
    const invited = email ? UserModel.findByEmail(email) : UserModel.findByCode(code);
    // mesma mensagem se não existe: não revela quem tem conta
    if (!invited) {
      throw new HttpError(
        404,
        email
          ? 'Não achei ninguém com esse e-mail. A pessoa precisa ter uma conta no Mural.'
          : 'Não achei ninguém com esse ID. Confira se copiou certinho (ex.: K7P2-9QXM).',
      );
    }
    if (invited.id === req.user.id) throw new HttpError(400, 'Essa pasta já é sua 🙂');
    if (FolderModel.isMember(folder.id, invited.id)) throw new HttpError(409, `${invited.name} já participa desta pasta.`);
    if (FolderModel.members(folder.id).length >= MAX_MEMBERS) {
      throw new HttpError(400, `Uma pasta pode ser compartilhada com até ${MAX_MEMBERS} pessoas.`);
    }
    FolderModel.addMember(folder.id, invited.id);
    res.status(201).json({ message: `Pasta compartilhada com ${invited.name}!`, member: { id: invited.id, name: invited.name, code: invited.code } });
  },

  // Dono tira alguém, ou o próprio convidado sai da pasta
  removeMember(req, res) {
    const access = folderAccess(req.user.id, req.params.id);
    const memberId = parseId(req.params.userId);
    const leaving = memberId === req.user.id;
    if (access.role !== 'owner' && !leaving) throw new HttpError(403, 'Só quem criou a pasta pode tirar outras pessoas.');
    if (!FolderModel.removeMember(access.folderId, memberId)) throw new HttpError(404, 'Essa pessoa não participa da pasta.');
    live.kick(access.folderId, memberId);
    res.json({ message: leaving ? 'Você saiu da pasta.' : 'Pessoa removida da pasta.' });
  },
};
