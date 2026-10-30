import { db } from '../config/db.js';

export const MAX_LINKS_PER_FOLDER = 300;

const toLink = (row) =>
  row && {
    id: row.id,
    fromId: row.from_id,
    toId: row.to_id,
    createdBy: row.created_by ?? null,
    createdAt: row.created_at,
  };

// Conexões (setas) entre dois post-its da mesma pasta. Pertencem ao dono da pasta, como os post-its.
// Só aparecem quando os dois post-its estão no mural (fora da lixeira e do arquivo).
export const LinkModel = {
  listForFolder(ownerId, folderId) {
    return db
      .prepare(
        `SELECT l.* FROM note_links l
           JOIN notes a ON a.id = l.from_id
           JOIN notes b ON b.id = l.to_id
          WHERE l.owner_id = ? AND a.folder_id IS ? AND b.folder_id IS ?
            AND a.deleted_at IS NULL AND a.archived_at IS NULL
            AND b.deleted_at IS NULL AND b.archived_at IS NULL
          ORDER BY l.id`,
      )
      .all(ownerId, folderId, folderId)
      .map(toLink);
  },

  // Todas as conexões do dono (para o backup)
  listByOwner(ownerId) {
    return db.prepare('SELECT * FROM note_links WHERE owner_id = ? ORDER BY id').all(ownerId).map(toLink);
  },

  findById(id) {
    return toLink(db.prepare('SELECT * FROM note_links WHERE id = ?').get(id));
  },

  // A→B e B→A contam como a mesma ligação
  findBetween(a, b) {
    return toLink(db.prepare('SELECT * FROM note_links WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)').get(a, b, b, a));
  },

  countForFolder(ownerId, folderId) {
    return db
      .prepare('SELECT COUNT(*) AS c FROM note_links l JOIN notes a ON a.id = l.from_id WHERE l.owner_id = ? AND a.folder_id IS ?')
      .get(ownerId, folderId).c;
  },

  create(ownerId, fromId, toId, createdBy) {
    const r = db.prepare('INSERT INTO note_links (owner_id, from_id, to_id, created_by) VALUES (?, ?, ?, ?)').run(ownerId, fromId, toId, createdBy);
    return this.findById(Number(r.lastInsertRowid));
  },

  remove(id) {
    return db.prepare('DELETE FROM note_links WHERE id = ?').run(id).changes > 0;
  },
};
