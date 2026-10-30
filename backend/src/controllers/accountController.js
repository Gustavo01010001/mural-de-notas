// Conta e LGPD: baixar todos os dados (backup), trazer um backup de volta e excluir a conta.
// Excluir não apaga na hora: a conta fica 30 dias "em espera". Entrar de novo nesse prazo recupera tudo.
import { db } from '../config/db.js';
import { ACCOUNT_GRACE_DAYS, UserModel } from '../models/userModel.js';
import { FolderModel, MAX_DEPTH } from '../models/folderModel.js';
import { NoteModel } from '../models/noteModel.js';
import { LinkModel } from '../models/linkModel.js';
import { SettingsModel } from '../models/settingsModel.js';
import { clearSessionCookie } from '../middlewares/auth.js';
import { HttpError } from '../utils/httpError.js';
import { NO_PASSWORD, verifyPassword } from '../utils/password.js';
import { validateImage, validateNote, validatePosition, validateSize } from '../utils/validators.js';

const MAX_IMPORT_NOTES = 3000;

// Um post-it no formato do arquivo de backup (com a foto embutida)
function serialize(ownerId, n, folderId = n.folderId) {
  const img = n.hasImage ? NoteModel.getImage(ownerId, n.id) : null;
  return {
    id: n.id,
    folderId,
    title: n.title,
    content: n.content,
    color: n.color,
    checklist: n.checklist,
    tags: n.tags,
    x: n.x,
    y: n.y,
    width: n.width,
    height: n.height,
    pinned: n.pinned,
    status: n.status,
    eventDate: n.eventDate,
    eventType: n.eventType,
    eventTime: n.eventTime,
    remindBefore: n.remindBefore,
    repeat: n.repeat,
    image: img ? `data:${img.mime};base64,${Buffer.from(img.data).toString('base64')}` : null,
    createdAt: n.createdAt,
    updatedAt: n.updatedAt,
  };
}

export const AccountController = {
  // GET /account/export — tudo do usuário num arquivo JSON (inclusive fotos, arquivados e lixeira)
  export(req, res) {
    const userId = req.user.id;
    const folders = FolderModel.listByUser(userId).map(({ id, parentId, position, name, icon, color }) => ({ id, parentId, position, name, icon, color }));
    const rows = db.prepare('SELECT id FROM notes WHERE user_id = ? ORDER BY id').all(userId);
    const notes = rows.map(({ id }) => serialize(userId, NoteModel.findById(userId, id)));

    // Pastas compartilhadas comigo também vão no backup (marcadas como do grupo): quem participa
    // fica com uma cópia do que o grupo escreveu, mesmo que a dona saia ou exclua a conta.
    for (const f of FolderModel.listSharedWith(userId)) {
      const key = `grupo-${f.id}`;
      folders.push({ id: key, parentId: null, position: 0, name: f.name, icon: f.icon, color: f.color, shared: true, ownerName: f.ownerName });
      const groupNotes = db
        .prepare('SELECT id FROM notes WHERE folder_id = ? AND deleted_at IS NULL ORDER BY id')
        .all(f.id)
        .map(({ id }) => NoteModel.findAnyById(id));
      for (const n of groupNotes) notes.push({ ...serialize(n.ownerId, n, key), fromGroup: true });
    }
    const backup = {
      app: 'mural-de-notas',
      version: 1,
      exportedAt: new Date().toISOString(),
      user: { name: req.user.name, email: req.user.email },
      settings: SettingsModel.get(userId),
      folders,
      notes,
      // setas entre post-its (só as minhas; as do grupo são da dona da pasta)
      links: LinkModel.listByOwner(userId).map((l) => ({ from: l.fromId, to: l.toId, color: l.color })),
    };
    const day = new Date().toISOString().slice(0, 10);
    res.set('Content-Disposition', `attachment; filename="mural-de-notas-backup-${day}.json"`);
    res.set('Cache-Control', 'no-store');
    res.json(backup);
  },

  // POST /account/import { backup } — traz um backup para a conta atual (soma, não apaga nada)
  import(req, res) {
    const backup = req.body?.backup;
    if (!backup || backup.app !== 'mural-de-notas' || !Array.isArray(backup.notes) || !Array.isArray(backup.folders ?? [])) {
      throw new HttpError(400, 'Esse arquivo não parece um backup do Mural de Notas.');
    }
    if (backup.notes.length > MAX_IMPORT_NOTES) throw new HttpError(400, `Backup grande demais (máx. ${MAX_IMPORT_NOTES} post-its).`);
    const userId = req.user.id;

    // pastas: cria as "mães" antes das filhas; nome repetido ganha "(importada)"
    const idMap = new Map();
    const pending = [...(backup.folders ?? [])];
    let guard = 0;
    while (pending.length && guard++ < 10_000) {
      const f = pending.shift();
      const parentOld = f.parentId ?? null;
      if (parentOld !== null && !idMap.has(parentOld)) {
        if (pending.some((p) => p.id === parentOld)) pending.push(f);
        continue; // mãe não existe no arquivo: pula
      }
      const parentId = parentOld === null ? null : idMap.get(parentOld);
      if (parentId !== null && FolderModel.depthOf(parentId) >= MAX_DEPTH) continue;
      let name = String(f.name ?? 'Pasta').trim().slice(0, 30) || 'Pasta';
      // pasta que era de um grupo volta como uma cópia minha
      if (f.shared) name = `${name.slice(0, 23)} (cópia do grupo)`;
      if (FolderModel.findByName(userId, name, parentId)) name = `${name.slice(0, 18)} (importada)`;
      for (let i = 2; FolderModel.findByName(userId, name, parentId); i++) name = `${String(f.name).slice(0, 26)} (${i})`;
      const created = FolderModel.create(userId, { name, icon: f.icon, color: f.color, parentId });
      idMap.set(f.id, created.id);
    }

    let imported = 0;
    let skipped = 0;
    const noteMap = new Map(); // id no arquivo → id novo (para refazer as setas)
    for (const raw of backup.notes) {
      if (raw.status === 'trash') {
        skipped++;
        continue; // o que estava na lixeira não volta
      }
      try {
        const data = validateNote(raw);
        const pos = validatePosition({ x: raw.x ?? 80, y: raw.y ?? 120 });
        const note = NoteModel.create(userId, {
          ...data,
          ...pos,
          rotation: Math.round((Math.random() * 8 - 4) * 10) / 10,
          folderId: raw.folderId ? idMap.get(raw.folderId) ?? null : null,
          pinned: Boolean(raw.pinned),
        });
        if (raw.width && raw.height) NoteModel.updateSize(userId, note.id, validateSize(raw));
        if (raw.status === 'archived') NoteModel.setArchived(userId, note.id, true);
        if (raw.image) {
          try {
            const img = validateImage({ dataUrl: raw.image });
            NoteModel.setImage(userId, note.id, img.mime, img.data);
          } catch {
            // foto estragada: importa o post-it sem ela
          }
        }
        noteMap.set(raw.id, note.id);
        imported++;
      } catch {
        skipped++;
      }
    }

    // setas entre post-its: só se os dois vieram e estão na mesma pasta
    let links = 0;
    for (const l of Array.isArray(backup.links) ? backup.links.slice(0, 2000) : []) {
      const a = noteMap.get(l.from);
      const b = noteMap.get(l.to);
      if (!a || !b || a === b || LinkModel.findBetween(a, b)) continue;
      if (NoteModel.findById(userId, a)?.folderId !== NoteModel.findById(userId, b)?.folderId) continue;
      LinkModel.create(userId, a, b, userId, ['red', 'blue', 'green', 'yellow', 'purple'].includes(l.color) ? l.color : 'red');
      links++;
    }
    res.json({
      message: `Backup importado: ${imported} post-it${imported === 1 ? '' : 's'} e ${idMap.size} pasta${idMap.size === 1 ? '' : 's'}.${skipped ? ` (${skipped} ignorado${skipped === 1 ? '' : 's'})` : ''}`,
      imported,
      folders: idMap.size,
      skipped,
      links,
    });
  },

  // DELETE /account { password } (ou { confirmEmail } para quem só usa Google)
  remove(req, res) {
    const row = UserModel.findRawById(req.user.id);
    if (row.password_hash !== NO_PASSWORD) {
      if (!verifyPassword(String(req.body?.password ?? ''), row.password_hash)) throw new HttpError(401, 'Senha incorreta. A conta não foi excluída.');
    } else if (String(req.body?.confirmEmail ?? '').trim().toLowerCase() !== row.email) {
      throw new HttpError(400, 'Digite o seu e-mail para confirmar.');
    }
    UserModel.markDeleted(row.id);
    clearSessionCookie(req, res);
    const until = new Date(Date.now() + ACCOUNT_GRACE_DAYS * 86_400_000).toLocaleDateString('pt-BR');
    res.json({
      message: `Conta marcada para exclusão. Se mudar de ideia, é só entrar de novo até ${until} que tudo volta.`,
      graceDays: ACCOUNT_GRACE_DAYS,
      until,
    });
  },
};
