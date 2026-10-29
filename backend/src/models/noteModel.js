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

// Alertas fechados: lista de chaves "AAAA-MM-DD:etapa" (etapa = soon | due).
// Bancos antigos guardavam só a data do dia em que o alerta foi fechado.
function parseDismissed(value) {
  if (!value) return [];
  if (value.startsWith('[')) return parseJson(value, []);
  return [`${value}:due`];
}

// Converte a linha do banco (snake_case) para o formato que a API devolve
function toNote(row) {
  if (!row) return null;
  const repeat = row.repeat_rule ?? (row.repeat_yearly ? 'yearly' : 'none');
  return {
    id: row.id,
    ownerId: row.user_id,
    createdBy: row.created_by ?? row.user_id,
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
    eventTime: row.event_time ?? null,
    eventType: row.event_type,
    remindBefore: row.remind_before ?? 0,
    repeat,
    repeatYearly: repeat === 'yearly',
    dismissed: parseDismissed(row.dismissed_on),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version ?? 1,
    updatedBy: row.updated_by ?? row.created_by ?? row.user_id,
    deletedBy: row.deleted_by ?? null,
  };
}

const inShared = (ids) => (ids.length ? `OR n.folder_id IN (${ids.map(() => '?').join(',')})` : '');

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

  // Para a busca: ativos e arquivados (a lixeira fica de fora), meus e das pastas compartilhadas comigo
  listSearchable(userId, sharedFolderIds = []) {
    return db
      .prepare(`${SELECT} WHERE n.deleted_at IS NULL AND (n.user_id = ? ${inShared(sharedFolderIds)}) ORDER BY n.updated_at DESC`)
      .all(userId, ...sharedFolderIds)
      .map(toNote);
  },

  // Para o calendário: post-its ativos com data, meus e das pastas compartilhadas comigo
  listDatedVisible(userId, sharedFolderIds = []) {
    return db
      .prepare(`${SELECT} WHERE n.event_date IS NOT NULL AND ${ACTIVE} AND (n.user_id = ? ${inShared(sharedFolderIds)})`)
      .all(userId, ...sharedFolderIds)
      .map(toNote);
  },

  findAnyById(id) {
    return toNote(db.prepare(`${SELECT} WHERE n.id = ?`).get(id));
  },

  listArchived(userId) {
    return db
      .prepare(`${SELECT} WHERE n.user_id = ? AND n.deleted_at IS NULL AND n.archived_at IS NOT NULL ORDER BY n.archived_at DESC`)
      .all(userId)
      .map(toNote);
  },

  // Lixeira: o que é meu + o que EU excluí em pastas compartilhadas comigo (para eu mesmo poder desfazer)
  listTrash(userId, sharedFolderIds = []) {
    const shared = sharedFolderIds.length
      ? `OR (n.deleted_by = ? AND n.folder_id IN (${sharedFolderIds.map(() => '?').join(',')}))`
      : '';
    return db
      .prepare(`${SELECT} WHERE n.deleted_at IS NOT NULL AND (n.user_id = ? ${shared}) ORDER BY n.deleted_at DESC`)
      .all(userId, ...(sharedFolderIds.length ? [userId, ...sharedFolderIds] : []))
      .map(toNote);
  },

  // Alertas fechados por um convidado (cada pessoa fecha o seu, sem fechar para o grupo)
  memberDismissed(userId, noteIds) {
    if (!noteIds.length) return new Map();
    const rows = db
      .prepare(`SELECT note_id, keys FROM alert_dismissals WHERE user_id = ? AND note_id IN (${noteIds.map(() => '?').join(',')})`)
      .all(userId, ...noteIds);
    return new Map(rows.map((r) => [r.note_id, parseJson(r.keys, [])]));
  },

  dismissForMember(userId, noteId, key) {
    const current = this.memberDismissed(userId, [noteId]).get(noteId) ?? [];
    const keys = [...new Set([...current, key])].slice(-12);
    db.prepare(
      `INSERT INTO alert_dismissals (user_id, note_id, keys) VALUES (?, ?, ?)
       ON CONFLICT(user_id, note_id) DO UPDATE SET keys = excluded.keys`,
    ).run(userId, noteId, JSON.stringify(keys));
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

  countSpecial(userId, sharedFolderIds = []) {
    const counts = db
      .prepare(
        `SELECT SUM(deleted_at IS NOT NULL) AS trash,
                SUM(deleted_at IS NULL AND archived_at IS NOT NULL) AS archived
           FROM notes WHERE user_id = ?`,
      )
      .get(userId);
    // + o que eu excluí em pastas compartilhadas comigo (está na minha lixeira também)
    if (sharedFolderIds.length) {
      counts.trash =
        (counts.trash ?? 0) +
        db
          .prepare(`SELECT COUNT(*) AS c FROM notes WHERE deleted_at IS NOT NULL AND deleted_by = ? AND folder_id IN (${sharedFolderIds.map(() => '?').join(',')})`)
          .get(userId, ...sharedFolderIds).c;
    }
    return counts;
  },

  maxZ(userId) {
    return db.prepare('SELECT COALESCE(MAX(z_index), 0) AS z FROM notes WHERE user_id = ?').get(userId).z;
  },

  create(userId, n) {
    const result = db
      .prepare(
        `INSERT INTO notes (user_id, folder_id, title, content, color, pos_x, pos_y, rotation, z_index,
                            width, height, pinned, checklist, tags, event_date, event_type, repeat_yearly,
                            event_time, remind_before, repeat_rule, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        n.repeat === 'yearly' ? 1 : 0,
        n.eventTime ?? null,
        n.remindBefore ?? 0,
        n.repeat ?? 'none',
        n.createdBy ?? userId,
      );
    return this.findById(userId, Number(result.lastInsertRowid));
  },

  update(userId, id, n, actorId = userId) {
    // Mudou data, hora ou aviso? Então os alertas voltam a valer.
    db.prepare(
      `UPDATE notes
          SET title = ?, content = ?, color = ?, checklist = ?, tags = ?,
              dismissed_on = CASE WHEN event_date IS ? AND event_time IS ? AND remind_before = ? AND repeat_rule IS ?
                                  THEN dismissed_on ELSE NULL END,
              event_date = ?, event_type = ?, repeat_yearly = ?, event_time = ?, remind_before = ?, repeat_rule = ?,
              updated_at = datetime('now'), version = version + 1, updated_by = ?
        WHERE id = ? AND user_id = ?`,
    ).run(
      n.title,
      n.content,
      n.color,
      JSON.stringify(n.checklist),
      JSON.stringify(n.tags),
      n.eventDate,
      n.eventTime ?? null,
      n.remindBefore ?? 0,
      n.repeat ?? 'none',
      n.eventDate,
      n.eventType,
      n.repeat === 'yearly' ? 1 : 0,
      n.eventTime ?? null,
      n.remindBefore ?? 0,
      n.repeat ?? 'none',
      actorId,
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

  setChecklist(userId, id, checklist, actorId = userId) {
    db.prepare(
      `UPDATE notes SET checklist = ?, updated_at = datetime('now'), version = version + 1, updated_by = ? WHERE id = ? AND user_id = ?`,
    ).run(JSON.stringify(checklist), actorId, id, userId);
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

  // Guarda que o alerta "AAAA-MM-DD:etapa" foi fechado (mantém só os mais recentes)
  dismiss(userId, id, key) {
    const note = this.findById(userId, id);
    if (!note) return null;
    const keys = [...new Set([...note.dismissed, key])].slice(-12);
    db.prepare('UPDATE notes SET dismissed_on = ? WHERE id = ? AND user_id = ?').run(JSON.stringify(keys), id, userId);
    return this.findById(userId, id);
  },

  // Lixeira: "excluir" só marca a data; dá para desfazer/restaurar por 30 dias
  moveToTrash(userId, id, actorId = userId) {
    db.prepare(
      `UPDATE notes SET deleted_at = datetime('now'), deleted_by = ? WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
    ).run(actorId, id, userId);
    return this.findById(userId, id);
  },

  restore(userId, id) {
    db.prepare('UPDATE notes SET deleted_at = NULL, deleted_by = NULL, z_index = ? WHERE id = ? AND user_id = ?').run(
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
