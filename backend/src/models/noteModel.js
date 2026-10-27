import { db } from '../config/db.js';

// Converte a linha do banco (snake_case) para o formato que a API devolve
function toNote(row) {
  if (!row) return null;
  return {
    id: row.id,
    folderId: row.folder_id ?? null,
    title: row.title,
    content: row.content,
    color: row.color,
    x: row.pos_x,
    y: row.pos_y,
    rotation: row.rotation,
    z: row.z_index,
    eventDate: row.event_date,
    eventType: row.event_type,
    repeatYearly: Boolean(row.repeat_yearly),
    dismissedOn: row.dismissed_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export const NoteModel = {
  // folderId: null = Mural geral (sem pasta)
  listByFolder(userId, folderId) {
    return db
      .prepare(
        `SELECT * FROM notes WHERE user_id = ? AND folder_id IS ?
          ORDER BY z_index ASC, id ASC`,
      )
      .all(userId, folderId)
      .map(toNote);
  },

  listAll(userId) {
    return db.prepare('SELECT * FROM notes WHERE user_id = ? ORDER BY updated_at DESC').all(userId).map(toNote);
  },

  moveToFolder(userId, id, folderId) {
    // Ao mudar de pasta, o post-it vai para a frente de todos lá
    db.prepare(
      `UPDATE notes SET folder_id = ?, z_index = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    ).run(folderId, this.maxZ(userId) + 1, id, userId);
    return this.findById(userId, id);
  },

  listWithDates(userId) {
    return db
      .prepare('SELECT * FROM notes WHERE user_id = ? AND event_date IS NOT NULL')
      .all(userId)
      .map(toNote);
  },

  findById(userId, id) {
    return toNote(db.prepare('SELECT * FROM notes WHERE id = ? AND user_id = ?').get(id, userId));
  },

  maxZ(userId) {
    return db.prepare('SELECT COALESCE(MAX(z_index), 0) AS z FROM notes WHERE user_id = ?').get(userId).z;
  },

  create(userId, n) {
    const result = db
      .prepare(
        `INSERT INTO notes (user_id, folder_id, title, content, color, pos_x, pos_y, rotation, z_index,
                            event_date, event_type, repeat_yearly)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        userId,
        n.folderId ?? null,
        n.title,
        n.content,
        n.color,
        n.x,
        n.y,
        n.rotation,
        this.maxZ(userId) + 1,
        n.eventDate,
        n.eventType,
        n.repeatYearly ? 1 : 0,
      );
    return this.findById(userId, Number(result.lastInsertRowid));
  },

  update(userId, id, n) {
    // Mudou a data? Então o alerta volta a valer.
    db.prepare(
      `UPDATE notes
          SET title = ?, content = ?, color = ?, event_date = ?, event_type = ?, repeat_yearly = ?,
              dismissed_on = CASE WHEN event_date IS ? THEN dismissed_on ELSE NULL END,
              updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    ).run(
      n.title,
      n.content,
      n.color,
      n.eventDate,
      n.eventType,
      n.repeatYearly ? 1 : 0,
      n.eventDate,
      id,
      userId,
    );
    return this.findById(userId, id);
  },

  updatePosition(userId, id, { x, y, bringToFront }) {
    const z = bringToFront ? this.maxZ(userId) + 1 : null;
    db.prepare(
      `UPDATE notes SET pos_x = ?, pos_y = ?, z_index = COALESCE(?, z_index)
        WHERE id = ? AND user_id = ?`,
    ).run(x, y, z, id, userId);
    return this.findById(userId, id);
  },

  dismiss(userId, id, day) {
    db.prepare('UPDATE notes SET dismissed_on = ? WHERE id = ? AND user_id = ?').run(day, id, userId);
    return this.findById(userId, id);
  },

  remove(userId, id) {
    return db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, userId).changes > 0;
  },
};
