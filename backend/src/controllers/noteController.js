import { NoteModel, TRASH_DAYS } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';
import { UserModel } from '../models/userModel.js';
import { withCountdown } from '../services/alertService.js';
import { listTags, searchNotes } from '../services/searchService.js';
import { arrangeNotes } from '../services/arrangeService.js';
import { folderAccess, noteAccess } from '../services/accessService.js';
import { live } from '../services/liveService.js';
import { HttpError } from '../utils/httpError.js';
import { todayIn } from '../utils/dates.js';
import {
  parseFolderId,
  parseId,
  validateBatch,
  validateImage,
  validateNote,
  validatePosition,
  validateSize,
} from '../utils/validators.js';

const folderName = (folderId) => (folderId ? FolderModel.findAnyById(folderId)?.name ?? 'pasta' : 'Mural geral');
const view = (note, req) => withCountdown(note, todayIn(req.query.tz));

// Mudança num post-it: avisa quem está com a pasta aberta ao vivo
const changed = (note, req) => live.notify(note.folderId, req.user.id);

// Mover entre pastas só vale entre pastas do mesmo dono
// (um convidado não pode "levar embora" um post-it da pasta compartilhada, nem o contrário)
function targetFolderFor(req, note, rawFolderId) {
  const target = folderAccess(req.user.id, rawFolderId);
  if (target.ownerId !== note.ownerId) {
    throw new HttpError(403, 'Só dá para mover entre pastas do mesmo dono. Use "Duplicar" para levar uma cópia.');
  }
  return target;
}

export const NoteController = {
  // GET /notes?folder=root|<id>
  list(req, res) {
    const access = folderAccess(req.user.id, req.query.folder);
    const today = todayIn(req.query.tz);
    const notes = NoteModel.listByFolder(access.ownerId, access.folderId).map((n) => withCountdown(n, today));
    res.json({ folderId: access.folderId, role: access.role, notes });
  },

  // GET /notes/search?q=palavras&color=&folder=&tag=&hasDate=1
  search(req, res) {
    const q = String(req.query.q ?? '').slice(0, 100);
    const filters = {
      color: req.query.color || null,
      folder: req.query.folder === undefined || req.query.folder === '' ? undefined : parseFolderId(req.query.folder),
      tag: req.query.tag ? String(req.query.tag).toLowerCase().replace(/^#/, '') : null,
      hasDate: req.query.hasDate === '1' || req.query.hasDate === 'true',
    };
    const { results, dateLabel } = searchNotes(req.user.id, q, filters, req.query.tz);
    const today = todayIn(req.query.tz);
    res.json({ query: q, dateLabel, results: results.map((n) => withCountdown(n, today)) });
  },

  // GET /notes/tags — todas as etiquetas usadas (para o filtro da busca)
  tags(req, res) {
    res.json({ tags: listTags(req.user.id) });
  },

  archived(req, res) {
    const today = todayIn(req.query.tz);
    res.json({ notes: NoteModel.listArchived(req.user.id).map((n) => withCountdown(n, today)) });
  },

  trash(req, res) {
    NoteModel.purgeOldTrash();
    const today = todayIn(req.query.tz);
    // inclui o que eu excluí em pastas compartilhadas comigo (aparece com o nome da dona; só ela apaga de vez)
    const shared = FolderModel.sharedFolderIds(req.user.id);
    const owners = new Map();
    const ownerName = (id) => (owners.has(id) ? owners.get(id) : owners.set(id, UserModel.findById(id)?.name ?? '').get(id));
    const notes = NoteModel.listTrash(req.user.id, shared).map((n) => ({
      ...withCountdown(n, today),
      ...(n.ownerId !== req.user.id ? { sharedTrash: true, ownerName: ownerName(n.ownerId), folderName: folderName(n.folderId) } : {}),
    }));
    res.json({ days: TRASH_DAYS, notes });
  },

  create(req, res) {
    const access = folderAccess(req.user.id, req.body?.folderId);
    const data = { ...validateNote(req.body), folderId: access.folderId, createdBy: req.user.id };
    const pos = validatePosition({
      x: req.body.x ?? 80 + Math.random() * 300,
      y: req.body.y ?? 140 + Math.random() * 200,
    });
    // Cada post-it nasce levemente torto, como no papel de verdade
    const rotation = Math.round((Math.random() * 8 - 4) * 10) / 10;
    const note = NoteModel.create(access.ownerId, { ...data, ...pos, rotation });
    changed(note, req);
    res.status(201).json({ message: 'Post-it criado!', note: view(note, req) });
  },

  update(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    // Duas pessoas editando o mesmo post-it: quem abriu uma versão antiga não apaga o que o outro fez sem saber.
    // baseVersion = versão que a pessoa abriu; force = "salvar a minha mesmo assim".
    const base = req.body?.baseVersion;
    if (base !== undefined && base !== null && !req.body?.force && Number(base) !== note.version) {
      const mine = note.updatedBy === req.user.id;
      const by = mine ? 'Você' : UserModel.findById(note.updatedBy)?.name ?? 'Outra pessoa';
      throw new HttpError(
        409,
        mine ? 'Você mudou este post-it em outra aba ou aparelho enquanto editava aqui.' : `${by} mudou este post-it enquanto você editava.`,
        { conflict: { by, mine, note: view(note, req) } },
      );
    }
    const updated = NoteModel.update(ownerId, note.id, validateNote(req.body), req.user.id);
    changed(updated, req);
    res.json({ message: 'Post-it atualizado!', note: view(updated, req) });
  },

  move(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const updated = NoteModel.updatePosition(ownerId, note.id, validatePosition(req.body));
    changed(updated, req);
    res.json({ note: view(updated, req) });
  },

  resize(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const updated = NoteModel.updateSize(ownerId, note.id, validateSize(req.body));
    changed(updated, req);
    res.json({ note: view(updated, req) });
  },

  moveToFolder(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const target = targetFolderFor(req, note, req.body?.folderId);
    if (note.folderId === target.folderId) return res.json({ note: view(note, req) });
    const moved = NoteModel.moveToFolder(ownerId, note.id, target.folderId);
    live.notify(note.folderId, req.user.id);
    live.notify(target.folderId, req.user.id);
    res.json({ message: `Post-it movido para "${folderName(target.folderId)}".`, note: view(moved, req) });
  },

  // PATCH /notes/:id/checklist/:itemId  { done }
  toggleChecklistItem(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const item = note.checklist.find((i) => i.id === req.params.itemId);
    if (!item) throw new HttpError(404, 'Item da checklist não encontrado.');
    const checklist = note.checklist.map((i) => (i.id === item.id ? { ...i, done: Boolean(req.body?.done) } : i));
    const updated = NoteModel.setChecklist(ownerId, note.id, checklist, req.user.id);
    changed(updated, req);
    res.json({ note: view(updated, req) });
  },

  pin(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const pinned = Boolean(req.body?.pinned);
    const updated = NoteModel.setPinned(ownerId, note.id, pinned);
    changed(updated, req);
    res.json({ message: pinned ? 'Post-it fixado no topo 📌' : 'Post-it desafixado.', note: view(updated, req) });
  },

  archive(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const archived = req.body?.archived !== false;
    const updated = NoteModel.setArchived(ownerId, note.id, archived);
    changed(updated, req);
    res.json({ message: archived ? 'Post-it arquivado.' : 'Post-it voltou para o mural.', note: view(updated, req) });
  },

  duplicate(req, res) {
    const { note: src, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const copy = NoteModel.create(ownerId, {
      ...src,
      title: `${src.title}`.slice(0, 80),
      x: src.x + 30,
      y: src.y + 30,
      pinned: false,
      createdBy: req.user.id,
      checklist: src.checklist.map((i, n) => ({ ...i, id: `c${Date.now().toString(36)}${n}` })),
    });
    if (src.hasImage) NoteModel.copyImage(ownerId, src.id, copy.id);
    const fresh = NoteModel.findById(ownerId, copy.id);
    changed(fresh, req);
    res.status(201).json({ message: 'Post-it duplicado!', note: view(fresh, req) });
  },

  // "Excluir" = mandar para a lixeira do dono (dá para desfazer)
  remove(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    NoteModel.moveToTrash(ownerId, note.id, req.user.id);
    changed(note, req);
    res.json({ message: 'Post-it foi para a lixeira.', id: note.id });
  },

  restore(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id), { allowTrash: true });
    if (note.status !== 'trash') return res.json({ note: view(note, req) });
    // Se a pasta dele foi apagada nesse meio tempo, ele já está no Mural geral
    const restored = NoteModel.restore(ownerId, note.id);
    changed(restored, req);
    res.json({ message: `Post-it restaurado em "${folderName(restored.folderId)}".`, note: view(restored, req) });
  },

  // Apagar de vez só na própria lixeira
  removeForever(req, res) {
    const id = parseId(req.params.id);
    if (!NoteModel.removeForever(req.user.id, id)) throw new HttpError(404, 'Post-it não está na lixeira.');
    res.json({ message: 'Post-it apagado para sempre.' });
  },

  emptyTrash(req, res) {
    const count = NoteModel.emptyTrash(req.user.id);
    res.json({ message: count ? `Lixeira esvaziada (${count} post-it${count === 1 ? '' : 's'}).` : 'A lixeira já estava vazia.' });
  },

  // POST /notes/batch { ids, action: move|archive|delete|pin|unpin, folderId }
  batch(req, res) {
    const { ids, action } = validateBatch(req.body);
    const done = [];
    const folders = new Set();
    let target = null;
    for (const id of ids) {
      let access;
      try {
        access = noteAccess(req.user.id, id);
      } catch {
        continue; // post-it que não é meu (nem compartilhado comigo): ignora
      }
      const { note, ownerId } = access;
      if (action === 'move') {
        target = targetFolderFor(req, note, req.body.folderId);
        NoteModel.moveToFolder(ownerId, note.id, target.folderId);
        folders.add(target.folderId);
      }
      if (action === 'archive') NoteModel.setArchived(ownerId, note.id, true);
      if (action === 'delete') NoteModel.moveToTrash(ownerId, note.id, req.user.id);
      if (action === 'pin' || action === 'unpin') NoteModel.setPinned(ownerId, note.id, action === 'pin');
      folders.add(note.folderId);
      done.push(note.id);
    }
    for (const f of folders) live.notify(f, req.user.id);

    const n = done.length;
    const s = n === 1 ? '' : 's';
    const messages = {
      move: `${n} post-it${s} movido${s} para "${target ? folderName(target.folderId) : ''}".`,
      archive: `${n} post-it${s} arquivado${s}.`,
      delete: `${n} post-it${s} foi${n === 1 ? '' : 'ram'} para a lixeira.`,
      pin: `${n} post-it${s} fixado${s}.`,
      unpin: `${n} post-it${s} desafixado${s}.`,
    };
    res.json({ message: messages[action], ids: done });
  },

  // POST /notes/arrange { folderId, columns } — organiza a pasta em grade
  arrange(req, res) {
    const access = folderAccess(req.user.id, req.body?.folderId);
    const columns = Math.min(Math.max(Number(req.body?.columns) || 4, 1), 8);
    const notes = NoteModel.listByFolder(access.ownerId, access.folderId);
    NoteModel.setPositions(access.ownerId, arrangeNotes(notes, columns));
    live.notify(access.folderId, req.user.id);
    const today = todayIn(req.query.tz);
    res.json({
      message: 'Mural arrumado! ✨',
      notes: NoteModel.listByFolder(access.ownerId, access.folderId).map((n) => withCountdown(n, today)),
    });
  },

  // ----- foto -----
  getImage(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const img = NoteModel.getImage(ownerId, note.id);
    if (!img) throw new HttpError(404, 'Este post-it não tem foto.');
    res.set('Content-Type', img.mime);
    // Nunca guardar no cache do navegador: em PC compartilhado outra pessoa poderia ver a foto
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(img.data));
  },

  setImage(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    const { mime, data } = validateImage(req.body);
    NoteModel.setImage(ownerId, note.id, mime, data);
    changed(note, req);
    res.json({ message: 'Foto adicionada!', note: view(NoteModel.findById(ownerId, note.id), req) });
  },

  removeImage(req, res) {
    const { note, ownerId } = noteAccess(req.user.id, parseId(req.params.id));
    NoteModel.removeImage(ownerId, note.id);
    changed(note, req);
    res.json({ message: 'Foto removida.', note: view(NoteModel.findById(ownerId, note.id), req) });
  },
};
