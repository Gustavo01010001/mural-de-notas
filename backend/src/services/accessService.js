// Quem pode mexer em quê.
// - Dono: tudo nas suas pastas e post-its.
// - Convidado (pasta compartilhada): vê e edita os post-its DAQUELA pasta; não renomeia,
//   não apaga a pasta e não compartilha com mais ninguém.
// Os post-its de uma pasta compartilhada continuam pertencendo ao dono da pasta (ownerId);
// o convidado só "empresta" o acesso.
import { FolderModel } from '../models/folderModel.js';
import { NoteModel } from '../models/noteModel.js';
import { HttpError } from '../utils/httpError.js';
import { parseFolderId } from '../utils/validators.js';

/** Acesso a uma pasta (null = Mural geral do próprio usuário). */
export function folderAccess(userId, rawFolderId) {
  const folderId = parseFolderId(rawFolderId);
  if (folderId === null) return { folderId: null, ownerId: userId, role: 'owner', folder: null };
  const folder = FolderModel.findAnyById(folderId);
  if (folder && folder.ownerId === userId) return { folderId, ownerId: userId, role: 'owner', folder };
  if (folder && FolderModel.isMember(folderId, userId)) return { folderId, ownerId: folder.ownerId, role: 'member', folder };
  throw new HttpError(404, 'Pasta não encontrada.');
}

/** Só o dono pode (renomear, apagar, compartilhar...). */
export function ownFolderOr404(userId, rawFolderId) {
  const access = folderAccess(userId, rawFolderId);
  if (access.role !== 'owner' || !access.folder) throw new HttpError(404, 'Pasta não encontrada.');
  return access;
}

/** Acesso a um post-it: meu, ou numa pasta compartilhada comigo. */
export function noteAccess(userId, noteId, { allowTrash = false } = {}) {
  const note = NoteModel.findAnyById(noteId);
  const ok =
    note && (note.ownerId === userId || (note.folderId !== null && FolderModel.isMember(note.folderId, userId)));
  if (!ok || (!allowTrash && note.status === 'trash')) throw new HttpError(404, 'Post-it não encontrado.');
  return { note, ownerId: note.ownerId, isOwner: note.ownerId === userId };
}
