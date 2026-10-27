import { NoteModel } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';
import { withCountdown } from '../services/alertService.js';
import { searchNotes } from '../services/searchService.js';
import { HttpError } from '../utils/httpError.js';
import { todayIn } from '../utils/dates.js';
import { parseFolderId, parseId, validateNote, validatePosition } from '../utils/validators.js';

function findOr404(userId, id) {
  const note = NoteModel.findById(userId, id);
  if (!note) throw new HttpError(404, 'Post-it não encontrado.');
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

export const NoteController = {
  // GET /notes?folder=root|<id>
  list(req, res) {
    const today = todayIn(req.query.tz);
    const folderId = folderOr404(req.user.id, req.query.folder);
    const notes = NoteModel.listByFolder(req.user.id, folderId).map((n) => withCountdown(n, today));
    res.json({ folderId, notes });
  },

  // GET /notes/search?q=palavras
  search(req, res) {
    const q = String(req.query.q ?? '').slice(0, 100);
    const today = todayIn(req.query.tz);
    res.json({ query: q, results: searchNotes(req.user.id, q).map((n) => withCountdown(n, today)) });
  },

  moveToFolder(req, res) {
    const id = parseId(req.params.id);
    const note = findOr404(req.user.id, id);
    const folderId = folderOr404(req.user.id, req.body?.folderId);
    if (note.folderId === folderId) return res.json({ note: withCountdown(note, todayIn(req.query.tz)) });
    const moved = NoteModel.moveToFolder(req.user.id, id, folderId);
    const name = folderId ? FolderModel.findById(req.user.id, folderId).name : 'Mural geral';
    res.json({ message: `Post-it movido para "${name}".`, note: withCountdown(moved, todayIn(req.query.tz)) });
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
    res.status(201).json({
      message: 'Post-it criado!',
      note: withCountdown(note, todayIn(req.query.tz)),
    });
  },

  update(req, res) {
    const id = parseId(req.params.id);
    findOr404(req.user.id, id);
    const note = NoteModel.update(req.user.id, id, validateNote(req.body));
    res.json({ message: 'Post-it atualizado!', note: withCountdown(note, todayIn(req.query.tz)) });
  },

  move(req, res) {
    const id = parseId(req.params.id);
    findOr404(req.user.id, id);
    const note = NoteModel.updatePosition(req.user.id, id, validatePosition(req.body));
    res.json({ note: withCountdown(note, todayIn(req.query.tz)) });
  },

  remove(req, res) {
    const id = parseId(req.params.id);
    if (!NoteModel.remove(req.user.id, id)) throw new HttpError(404, 'Post-it não encontrado.');
    res.json({ message: 'Post-it removido.' });
  },
};
