import { db } from '../config/db.js';

export const MAX_DEPTH = 3; // Pasta › Subpasta › Sub-subpasta
export const MAX_MEMBERS = 20;

const NOTE_COUNT = `(SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id AND n.deleted_at IS NULL AND n.archived_at IS NULL)`;
const MEMBER_COUNT = `(SELECT COUNT(*) FROM folder_members m WHERE m.folder_id = f.id)`;

function toFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    ownerId: row.user_id,
    parentId: row.parent_id ?? null,
    position: row.position ?? 0,
    name: row.name,
    icon: row.icon,
    color: row.color,
    noteCount: row.note_count ?? 0,
    memberCount: row.member_count ?? 0,
    ownerName: row.owner_name ?? undefined,
    createdAt: row.created_at,
  };
}

const SELECT = `SELECT f.*, ${NOTE_COUNT} AS note_count, ${MEMBER_COUNT} AS member_count FROM folders f`;

export const FolderModel = {
  // Pastas do próprio usuário (a árvore é montada no front com parentId/position)
  listByUser(userId) {
    return db
      .prepare(`${SELECT} WHERE f.user_id = ? ORDER BY f.position ASC, f.created_at ASC, f.id ASC`)
      .all(userId)
      .map(toFolder);
  },

  // Pastas que outras pessoas compartilharam comigo
  listSharedWith(userId) {
    return db
      .prepare(
        `SELECT f.*, ${NOTE_COUNT} AS note_count, ${MEMBER_COUNT} AS member_count, u.name AS owner_name
           FROM folder_members m
           JOIN folders f ON f.id = m.folder_id
           JOIN users u ON u.id = f.user_id
          WHERE m.user_id = ?
          ORDER BY m.added_at ASC`,
      )
      .all(userId)
      .map(toFolder);
  },

  // Quantos post-its estão soltos no "Mural geral" (sem pasta)
  countRoot(userId) {
    return db
      .prepare('SELECT COUNT(*) AS c FROM notes WHERE user_id = ? AND folder_id IS NULL AND deleted_at IS NULL AND archived_at IS NULL')
      .get(userId).c;
  },

  // Só pastas do próprio usuário
  findById(userId, id) {
    return toFolder(db.prepare(`${SELECT} WHERE f.id = ? AND f.user_id = ?`).get(id, userId));
  },

  // Qualquer pasta (para conferir acesso de quem foi convidado)
  findAnyById(id) {
    return toFolder(db.prepare(`${SELECT} WHERE f.id = ?`).get(id));
  },

  findByName(userId, name, parentId) {
    return db
      .prepare('SELECT id FROM folders WHERE user_id = ? AND lower(name) = lower(?) AND parent_id IS ?')
      .get(userId, name, parentId ?? null);
  },

  // Profundidade: pasta raiz = 1
  depthOf(id) {
    let depth = 0;
    let current = id;
    while (current && depth <= MAX_DEPTH + 1) {
      depth++;
      current = db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(current)?.parent_id ?? null;
    }
    return depth;
  },

  // Altura da subárvore (pasta sem filhas = 1)
  subtreeHeight(id) {
    const children = db.prepare('SELECT id FROM folders WHERE parent_id = ?').all(id);
    return 1 + Math.max(0, ...children.map((c) => this.subtreeHeight(c.id)));
  },

  isDescendant(candidateId, ancestorId) {
    let current = candidateId;
    for (let i = 0; current && i < 10; i++) {
      if (current === ancestorId) return true;
      current = db.prepare('SELECT parent_id FROM folders WHERE id = ?').get(current)?.parent_id ?? null;
    }
    return false;
  },

  nextPosition(userId, parentId) {
    return db
      .prepare('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM folders WHERE user_id = ? AND parent_id IS ?')
      .get(userId, parentId ?? null).p;
  },

  create(userId, { name, icon, color, parentId }) {
    const r = db
      .prepare('INSERT INTO folders (user_id, name, icon, color, parent_id, position) VALUES (?, ?, ?, ?, ?, ?)')
      .run(userId, name, icon, color, parentId ?? null, this.nextPosition(userId, parentId));
    return this.findById(userId, Number(r.lastInsertRowid));
  },

  update(userId, id, { name, icon, color, parentId }) {
    const current = this.findById(userId, id);
    const moving = (parentId ?? null) !== current.parentId;
    db.prepare('UPDATE folders SET name = ?, icon = ?, color = ?, parent_id = ?, position = ? WHERE id = ? AND user_id = ?').run(
      name,
      icon,
      color,
      parentId ?? null,
      moving ? this.nextPosition(userId, parentId) : current.position,
      id,
      userId,
    );
    return this.findById(userId, id);
  },

  // Nova ordem das pastas irmãs (mesmo "pai")
  reorder(userId, parentId, ids) {
    const stmt = db.prepare('UPDATE folders SET position = ? WHERE id = ? AND user_id = ? AND parent_id IS ?');
    db.exec('BEGIN');
    try {
      ids.forEach((id, i) => stmt.run(i, id, userId, parentId ?? null));
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },

  // Apaga a pasta: post-its voltam para o Mural geral e as subpastas sobem um nível
  remove(userId, id) {
    const folder = this.findById(userId, id);
    if (!folder) return false;
    db.prepare('UPDATE folders SET parent_id = ? WHERE parent_id = ? AND user_id = ?').run(folder.parentId, id, userId);
    db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?').run(id, userId);
    return db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  },

  // ----- compartilhamento -----
  isMember(folderId, userId) {
    return Boolean(db.prepare('SELECT 1 FROM folder_members WHERE folder_id = ? AND user_id = ?').get(folderId, userId));
  },

  members(folderId) {
    return db
      .prepare(
        `SELECT u.id, u.name, u.email, m.added_at FROM folder_members m JOIN users u ON u.id = m.user_id
          WHERE m.folder_id = ? ORDER BY m.added_at ASC`,
      )
      .all(folderId);
  },

  addMember(folderId, userId) {
    db.prepare('INSERT OR IGNORE INTO folder_members (folder_id, user_id) VALUES (?, ?)').run(folderId, userId);
  },

  removeMember(folderId, userId) {
    return db.prepare('DELETE FROM folder_members WHERE folder_id = ? AND user_id = ?').run(folderId, userId).changes > 0;
  },

  // ids das pastas que me deram acesso
  sharedFolderIds(userId) {
    return db.prepare('SELECT folder_id FROM folder_members WHERE user_id = ?').all(userId).map((r) => r.folder_id);
  },
};
