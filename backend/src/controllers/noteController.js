import { NoteModel, TRASH_DAYS } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';
import { withCountdown } from '../services/alertService.js';
import { searchNotes } from '../services/searchService.js';
import { arrangeNotes } from '../services/arrangeService.js';
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

function findOr404(userId, id) {
  const note = NoteModel.findById(userId, id);
  if (!note) throw new HttpError(404, 'Post-it não encontrado.');
  return note;
}

// Só post-its que não estão na lixeira podem ser editados/movidos
function findUsableOr404(userId, id) {
  const note = findOr404(userId, id);
  if (note.status === 'trash') throw new HttpError(404, 'Post-it não encontrado.');
  return note;
}

// Garante que a pasta existe e é do usuário (null = Mural geral)
function folderOr404(userId, raw) {
  const folderId = parseFolderId(raw);
  if (folderId !== null && !FolderModel.findById(userId, folderId)) {
    throw new HttpError(404, 'Pasta não encontrada.');
  }
  return folderId;
}

const folderName = (userId, folderId) => (folderId ? FolderModel.findById(userId, folderId).name : 'Mural geral');

export const NoteController = {
  // GET /notes?folder=root|<id>
  list(req, res) {
    const today = todayIn(req.query.tz);
    const folderId = folderOr404(req.user.id, req.query.folder);
    const notes = NoteModel.listByFolder(req.user.id, folderId).map((n) => withCountdown(n, today));
    res.json({ folderId, notes });
  },

  // GET /notes/search?q=palavras  (ou #etiqueta)
  search(req, res) {
    const q = String(req.query.q ?? '').slice(0, 100);
    const today = todayIn(req.query.tz);
    res.json({ query: q, results: searchNotes(req.user.id, q).map((n) => withCountdown(n, today)) });
  },

  archived(req, res) {
    const today = todayIn(req.query.tz);
    res.json({ notes: NoteModel.listArchived(req.user.id).map((n) => withCountdown(n, today)) });
  },

  trash(req, res) {
    NoteModel.purgeOldTrash();
    const today = todayIn(req.query.tz);
    res.json({ days: TRASH_DAYS, notes: NoteModel.listTrash(req.user.id).map((n) => withCountdown(n, today)) });
  },

  create(req, res) {
    const data = { ...validateNote(req.body), folderId: folderOr404(req.user.id, req.body?.folderId) };
    const pos = validatePosition({
      x: req.body.x ?? 80 + Math.random() * 300,
      y: req.body.y ?? 140 + Math.random() * 200,
    });
    // Cada post-it nasce levemente torto, como no papel de verdade
    const rotation = Math.round((Math.random() * 8 - 4) * 10) / 10;
    const note = NoteModel.create(req.user.id, { ...data, ...pos, rotation });
    res.status(201).json({ message: 'Post-it criado!', note: withCountdown(note, todayIn(req.query.tz)) });
  },

  update(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    const note = NoteModel.update(req.user.id, id, validateNote(req.body));
    res.json({ message: 'Post-it atualizado!', note: withCountdown(note, todayIn(req.query.tz)) });
  },

  move(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    const note = NoteModel.updatePosition(req.user.id, id, validatePosition(req.body));
    res.json({ note: withCountdown(note, todayIn(req.query.tz)) });
  },

  resize(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    const note = NoteModel.updateSize(req.user.id, id, validateSize(req.body));
    res.json({ note: withCountdown(note, todayIn(req.query.tz)) });
  },

  moveToFolder(req, res) {
    const id = parseId(req.params.id);
    const note = findUsableOr404(req.user.id, id);
    const folderId = folderOr404(req.user.id, req.body?.folderId);
    if (note.folderId === folderId) return res.json({ note: withCountdown(note, todayIn(req.query.tz)) });
    const moved = NoteModel.moveToFolder(req.user.id, id, folderId);
    res.json({
      message: `Post-it movido para "${folderName(req.user.id, folderId)}".`,
      note: withCountdown(moved, todayIn(req.query.tz)),
    });
  },

  // PATCH /notes/:id/checklist/:itemId  { done }
  toggleChecklistItem(req, res) {
    const id = parseId(req.params.id);
    const note = findUsableOr404(req.user.id, id);
    const item = note.checklist.find((i) => i.id === req.params.itemId);
    if (!item) throw new HttpError(404, 'Item da checklist não encontrado.');
    const checklist = note.checklist.map((i) => (i.id === item.id ? { ...i, done: Boolean(req.body?.done) } : i));
    res.json({ note: withCountdown(NoteModel.setChecklist(req.user.id, id, checklist), todayIn(req.query.tz)) });
  },

  pin(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    const pinned = Boolean(req.body?.pinned);
    res.json({
      message: pinned ? 'Post-it fixado no topo 📌' : 'Post-it desafixado.',
      note: withCountdown(NoteModel.setPinned(req.user.id, id, pinned), todayIn(req.query.tz)),
    });
  },

  archive(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    const archived = req.body?.archived !== false;
    res.json({
      message: archived ? 'Post-it arquivado.' : 'Post-it voltou para o mural.',
      note: withCountdown(NoteModel.setArchived(req.user.id, id, archived), todayIn(req.query.tz)),
    });
  },

  duplicate(req, res) {
    const id = parseId(req.params.id);
    const src = findUsableOr404(req.user.id, id);
    const copy = NoteModel.create(req.user.id, {
      ...src,
      title: `${src.title}`.slice(0, 80),
      x: src.x + 30,
      y: src.y + 30,
      pinned: false,
      checklist: src.checklist.map((i, n) => ({ ...i, id: `c${Date.now().toString(36)}${n}` })),
    });
    if (src.hasImage) NoteModel.copyImage(req.user.id, src.id, copy.id);
    res.status(201).json({
      message: 'Post-it duplicado!',
      note: withCountdown(NoteModel.findById(req.user.id, copy.id), todayIn(req.query.tz)),
    });
  },

  // "Excluir" = mandar para a lixeira (dá para desfazer)
  remove(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    NoteModel.moveToTrash(req.user.id, id);
    res.json({ message: 'Post-it foi para a lixeira.', id });
  },

  restore(req, res) {
    const id = parseId(req.params.id);
    const note = findOr404(req.user.id, id);
    if (note.status !== 'trash') return res.json({ note: withCountdown(note, todayIn(req.query.tz)) });
    // Se a pasta dele foi apagada nesse meio tempo, ele já está no Mural geral
    const restored = NoteModel.restore(req.user.id, id);
    res.json({
      message: `Post-it restaurado em "${folderName(req.user.id, restored.folderId)}".`,
      note: withCountdown(restored, todayIn(req.query.tz)),
    });
  },

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
    const folderId = action === 'move' ? folderOr404(req.user.id, req.body.folderId) : null;
    const notes = NoteModel.findManyActive(req.user.id, ids);
    for (const n of notes) {
      if (action === 'move') NoteModel.moveToFolder(req.user.id, n.id, folderId);
      if (action === 'archive') NoteModel.setArchived(req.user.id, n.id, true);
      if (action === 'delete') NoteModel.moveToTrash(req.user.id, n.id);
      if (action === 'pin' || action === 'unpin') NoteModel.setPinned(req.user.id, n.id, action === 'pin');
    }
    const s = notes.length === 1 ? '' : 's';
    const messages = {
      move: `${notes.length} post-it${s} movido${s} para "${action === 'move' ? folderName(req.user.id, folderId) : ''}".`,
      archive: `${notes.length} post-it${s} arquivado${s}.`,
      delete: `${notes.length} post-it${s} foi${notes.length === 1 ? '' : 'ram'} para a lixeira.`,
      pin: `${notes.length} post-it${s} fixado${s}.`,
      unpin: `${notes.length} post-it${s} desafixado${s}.`,
    };
    res.json({ message: messages[action], ids: notes.map((n) => n.id) });
  },

  // POST /notes/arrange { folderId, columns } — organiza a pasta em grade
  arrange(req, res) {
    const folderId = folderOr404(req.user.id, req.body?.folderId);
    const columns = Math.min(Math.max(Number(req.body?.columns) || 4, 1), 8);
    const notes = NoteModel.listByFolder(req.user.id, folderId);
    NoteModel.setPositions(req.user.id, arrangeNotes(notes, columns));
    const today = todayIn(req.query.tz);
    res.json({
      message: 'Mural arrumado! ✨',
      notes: NoteModel.listByFolder(req.user.id, folderId).map((n) => withCountdown(n, today)),
    });
  },

  // ----- foto -----
  getImage(req, res) {
    const id = parseId(req.params.id);
    const img = NoteModel.getImage(req.user.id, id);
    if (!img) throw new HttpError(404, 'Este post-it não tem foto.');
    res.set('Content-Type', img.mime);
    // Nunca guardar no cache do navegador: em PC compartilhado outra pessoa poderia ver a foto
    res.set('Cache-Control', 'no-store');
    res.send(Buffer.from(img.data));
  },

  setImage(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    const { mime, data } = validateImage(req.body);
    NoteModel.setImage(req.user.id, id, mime, data);
    res.json({ message: 'Foto adicionada!', note: withCountdown(NoteModel.findById(req.user.id, id), todayIn(req.query.tz)) });
  },

  removeImage(req, res) {
    const id = parseId(req.params.id);
    findUsableOr404(req.user.id, id);
    NoteModel.removeImage(req.user.id, id);
    res.json({ message: 'Foto removida.', note: withCountdown(NoteModel.findById(req.user.id, id), todayIn(req.query.tz)) });
  },
};
