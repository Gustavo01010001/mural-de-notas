// Conexão com o SQLite usando o módulo nativo do Node (node:sqlite).
// Não precisa instalar nada: o arquivo do banco é criado em backend/data/notas.db
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

// DB_DIR permite usar outro banco (ex.: os testes automáticos usam uma pasta temporária)
const dataDir = process.env.DB_DIR
  ? path.resolve(process.env.DB_DIR)
  : path.resolve(import.meta.dirname, '..', '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, 'notas.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS notes (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title        TEXT NOT NULL,
    content      TEXT NOT NULL DEFAULT '',
    color        TEXT NOT NULL DEFAULT 'yellow',
    pos_x        REAL NOT NULL DEFAULT 80,
    pos_y        REAL NOT NULL DEFAULT 120,
    rotation     REAL NOT NULL DEFAULT 0,
    z_index      INTEGER NOT NULL DEFAULT 1,
    event_date   TEXT,               -- 'YYYY-MM-DD' (data importante, opcional)
    event_type   TEXT,               -- 'birthday' | 'event' | 'reminder'
    repeat_yearly INTEGER NOT NULL DEFAULT 0,
    dismissed_on TEXT,               -- dia em que o alerta foi fechado
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);

  CREATE TABLE IF NOT EXISTS user_settings (
    user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    data       TEXT NOT NULL DEFAULT '{}',  -- preferências em JSON
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- Pastas: cada uma é um mural separado para um tópico/momento
  CREATE TABLE IF NOT EXISTS folders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '📁',
    color      TEXT NOT NULL DEFAULT 'yellow',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_folders_user ON folders(user_id);
`);

// Migrações: bancos antigos ganham as colunas novas sem perder nada
const NOTE_MIGRATIONS = {
  folder_id: 'INTEGER REFERENCES folders(id) ON DELETE SET NULL',
  deleted_at: 'TEXT', // na lixeira desde (apagado de vez depois de 30 dias)
  archived_at: 'TEXT', // arquivado (sai do mural, mas não é apagado)
  pinned: 'INTEGER NOT NULL DEFAULT 0', // fixado no topo
  checklist: "TEXT NOT NULL DEFAULT '[]'", // [{ id, text, done }]
  tags: "TEXT NOT NULL DEFAULT '[]'", // ["urgente", "ideia"]
  width: 'REAL', // tamanho escolhido pelo usuário (null = padrão)
  height: 'REAL',
};
const noteColumns = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name);
for (const [col, type] of Object.entries(NOTE_MIGRATIONS)) {
  if (!noteColumns.includes(col)) db.exec(`ALTER TABLE notes ADD COLUMN ${col} ${type}`);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(user_id, folder_id);

  -- Foto do post-it (uma por post-it), guardada no próprio banco
  CREATE TABLE IF NOT EXISTS note_images (
    note_id    INTEGER PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mime       TEXT NOT NULL,
    data       BLOB NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);
