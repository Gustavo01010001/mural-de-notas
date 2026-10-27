import { db } from '../config/db.js';

function toFolder(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    icon: row.icon,
    color: row.color,
    noteCount: row.note_count ?? 0,
    createdAt: row.created_at,
  };
}

export const FolderModel = {
  listByUser(userId) {
    return db
      .prepare(
        `SELECT f.*, (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS note_count
           FROM folders f WHERE f.user_id = ? ORDER BY f.created_at ASC, f.id ASC`,
      )
      .all(userId)
      .map(toFolder);
  },

  // Quantos post-its estão soltos no "Mural geral" (sem pasta)
  countRoot(userId) {
    return db.prepare('SELECT COUNT(*) AS c FROM notes WHERE user_id = ? AND folder_id IS NULL').get(userId).c;
  },

  findById(userId, id) {
    return toFolder(
      db
        .prepare(
          `SELECT f.*, (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS note_count
             FROM folders f WHERE f.id = ? AND f.user_id = ?`,
        )
        .get(id, userId),
    );
  },

  findByName(userId, name) {
    return db.prepare('SELECT id FROM folders WHERE user_id = ? AND lower(name) = lower(?)').get(userId, name);
  },

  create(userId, { name, icon, color }) {
    const r = db.prepare('INSERT INTO folders (user_id, name, icon, color) VALUES (?, ?, ?, ?)').run(userId, name, icon, color);
    return this.findById(userId, Number(r.lastInsertRowid));
  },

  update(userId, id, { name, icon, color }) {
    db.prepare('UPDATE folders SET name = ?, icon = ?, color = ? WHERE id = ? AND user_id = ?').run(name, icon, color, id, userId);
    return this.findById(userId, id);
  },

  // Apaga a pasta; os post-its dela voltam para o Mural geral
  remove(userId, id) {
    db.prepare('UPDATE notes SET folder_id = NULL WHERE folder_id = ? AND user_id = ?').run(id, userId);
    return db.prepare('DELETE FROM folders WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  },
};
