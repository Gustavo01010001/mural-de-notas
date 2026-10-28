import { db } from '../config/db.js';

export const TRASH_DAYS = 30;

// Post-it "ativo" = está no mural (não está na lixeira nem arquivado)
const ACTIVE = 'deleted_at IS NULL AND archived_at IS NULL';

const parseJson = (s, fallback) => {
  try {
    return JSON.parse(s ?? '');
  } catch {
    return fallback;
  }
};

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
    width: row.width ?? null,
    height: row.height ?? null,
    pinned: Boolean(row.pinned),
    checklist: parseJson(row.checklist, []),
    tags: parseJson(row.tags, []),
    hasImage: Boolean(row.has_image),
    status: row.deleted_at ? 'trash' : row.archived_at ? 'archived' : 'active',
    deletedAt: row.deleted_at ?? null,
    archivedAt: row.archived_at ?? null,
    eventDate: row.event_date,
    eventType: row.event_type,
    repeatYearly: Boolean(row.repeat_yearly),
    dismissedOn: row.dismissed_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Todas as consultas já dizem se o post-it tem foto
const SELECT = `SELECT n.*, EXISTS(SELECT 1 FROM note_images i WHERE i.note_id = n.id) AS has_image FROM notes n`;

export const NoteModel = {
  // folderId: null = Mural geral (sem pasta). Fixados primeiro, depois a ordem de empilhamento.
  listByFolder(userId, folderId) {
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.folder_id IS ? AND ${ACTIVE} ORDER BY n.z_index ASC, n.id ASC`)
      .all(userId, folderId)
      .map(toNote);
  },

  // Para a busca: ativos e arquivados (a lixeira fica de fora)
  listSearchable(userId) {
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.deleted_at IS NULL ORDER BY n.updated_at DESC`)
      .all(userId)
      .map(toNote);
  },

  listArchived(userId) {
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.deleted_at IS NULL AND n.archived_at IS NOT NULL ORDER BY n.archived_at DESC`)
      .all(userId)
      .map(toNote);
  },

  listTrash(userId) {
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.deleted_at IS NOT NULL ORDER BY n.deleted_at DESC`)
      .all(userId)
      .map(toNote);
  },

  listWithDates(userId) {
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.event_date IS NOT NULL AND ${ACTIVE}`)
      .all(userId)
      .map(toNote);
  },

  findById(userId, id) {
    return toNote(db.prepare(`${SELECT} WHERE n.id = ? AND n.user_id = ?`).get(id, userId));
  },

  findManyActive(userId, ids) {
    if (!ids.length) return [];
    const marks = ids.map(() => '?').join(',');
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.id IN (${marks}) AND n.deleted_at IS NULL`)
      .all(userId, ...ids)
      .map(toNote);
  },

  countSpecial(userId) {
    return db
      .prepare(
        `SELECT SUM(deleted_at IS NOT NULL) AS trash,
                SUM(deleted_at IS NULL AND archived_at IS NOT NULL) AS archived
           FROM notes WHERE user_id = ?`,
      )
      .get(userId);
  },

  maxZ(userId) {
    return db.prepare('SELECT COALESCE(MAX(z_index), 0) AS z FROM notes WHERE user_id = ?').get(userId).z;
  },

  create(userId, n) {
    const result = db
      .prepare(
        `INSERT INTO notes (user_id, folder_id, title, content, color, pos_x, pos_y, rotation, z_index,
                            width, height, pinned, checklist, tags, event_date, event_type, repeat_yearly)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        n.width ?? null,
        n.height ?? null,
        n.pinned ? 1 : 0,
        JSON.stringify(n.checklist ?? []),
        JSON.stringify(n.tags ?? []),
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
          SET title = ?, content = ?, color = ?, checklist = ?, tags = ?,
              event_date = ?, event_type = ?, repeat_yearly = ?,
              dismissed_on = CASE WHEN event_date IS ? THEN dismissed_on ELSE NULL END,
              updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    ).run(
      n.title,
      n.content,
      n.color,
      JSON.stringify(n.checklist),
      JSON.stringify(n.tags),
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

  updateSize(userId, id, { width, height }) {
    db.prepare('UPDATE notes SET width = ?, height = ? WHERE id = ? AND user_id = ?').run(width, height, id, userId);
    return this.findById(userId, id);
  },

  setChecklist(userId, id, checklist) {
    db.prepare(`UPDATE notes SET checklist = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(
      JSON.stringify(checklist),
      id,
      userId,
    );
    return this.findById(userId, id);
  },

  setPinned(userId, id, pinned) {
    db.prepare('UPDATE notes SET pinned = ? WHERE id = ? AND user_id = ?').run(pinned ? 1 : 0, id, userId);
    return this.findById(userId, id);
  },

  setArchived(userId, id, archived) {
    db.prepare(
      `UPDATE notes SET archived_at = CASE WHEN ? THEN datetime('now') ELSE NULL END, z_index = ?
        WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(archived ? 1 : 0, this.maxZ(userId) + 1, id, userId);
    return this.findById(userId, id);
  },

  moveToFolder(userId, id, folderId) {
    // Ao mudar de pasta, o post-it vai para a frente de todos lá
    db.prepare(
      `UPDATE notes SET folder_id = ?, z_index = ?, updated_at = datetime('now')
        WHERE id = ? AND user_id = ?`,
    ).run(folderId, this.maxZ(userId) + 1, id, userId);
    return this.findById(userId, id);
  },

  dismiss(userId, id, day) {
    db.prepare('UPDATE notes SET dismissed_on = ? WHERE id = ? AND user_id = ?').run(day, id, userId);
    return this.findById(userId, id);
  },

  // Lixeira: "excluir" só marca a data; dá para desfazer/restaurar por 30 dias
  moveToTrash(userId, id) {
    db.prepare(`UPDATE notes SET deleted_at = datetime('now') WHERE id = ? AND user_id = ? AND deleted_at IS NULL`).run(
      id,
      userId,
    );
    return this.findById(userId, id);
  },

  restore(userId, id) {
    db.prepare('UPDATE notes SET deleted_at = NULL, z_index = ? WHERE id = ? AND user_id = ?').run(
      this.maxZ(userId) + 1,
      id,
      userId,
    );
    return this.findById(userId, id);
  },

  removeForever(userId, id) {
    return (
      db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ? AND deleted_at IS NOT NULL').run(id, userId).changes > 0
    );
  },

  emptyTrash(userId) {
    return db.prepare('DELETE FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL').run(userId).changes;
  },

  // Apaga de vez o que está na lixeira há mais de 30 dias (de todos os usuários)
  purgeOldTrash() {
    return db.prepare(`DELETE FROM notes WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`).run(
      `-${TRASH_DAYS} days`,
    ).changes;
  },

  // "Arrumar mural": grava as posições calculadas de uma vez só
  setPositions(userId, positions) {
    const stmt = db.prepare('UPDATE notes SET pos_x = ?, pos_y = ? WHERE id = ? AND user_id = ?');
    db.exec('BEGIN');
    try {
      for (const p of positions) stmt.run(p.x, p.y, p.id, userId);
      db.exec('COMMIT');
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  },

  // ----- foto -----
  getImage(userId, noteId) {
    return db.prepare('SELECT mime, data FROM note_images WHERE note_id = ? AND user_id = ?').get(noteId, userId);
  },

  setImage(userId, noteId, mime, data) {
    db.prepare(
      `INSERT INTO note_images (note_id, user_id, mime, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(note_id) DO UPDATE SET mime = excluded.mime, data = excluded.data, updated_at = datetime('now')`,
    ).run(noteId, userId, mime, data);
    // muda a "versão" do post-it para o navegador buscar a foto nova
    db.prepare(`UPDATE notes SET updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(noteId, userId);
  },

  removeImage(userId, noteId) {
    db.prepare('DELETE FROM note_images WHERE note_id = ? AND user_id = ?').run(noteId, userId);
  },

  copyImage(userId, fromId, toId) {
    db.prepare(
      `INSERT INTO note_images (note_id, user_id, mime, data)
       SELECT ?, user_id, mime, data FROM note_images WHERE note_id = ? AND user_id = ?`,
    ).run(toId, fromId, userId);
  },
};
