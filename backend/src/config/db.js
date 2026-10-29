// Conexão com o SQLite usando o módulo nativo do Node (node:sqlite).
// Não precisa instalar nada: o arquivo do banco é criado em backend/data/notas.db
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { generatePublicCode } from '../utils/publicCode.js';

// DB_DIR permite usar outro banco (ex.: os testes automáticos usam uma pasta temporária)
export const dataDir = process.env.DB_DIR
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
  event_time: 'TEXT', // 'HH:MM' (opcional) — lembrete com horário
  remind_before: 'INTEGER NOT NULL DEFAULT 0', // aviso antecipado, em minutos
  repeat_rule: 'TEXT', // 'none' | 'weekly' | 'monthly' | 'yearly'
  created_by: 'INTEGER', // quem criou (em pasta compartilhada pode não ser o dono)
  version: 'INTEGER NOT NULL DEFAULT 1', // sobe a cada mudança de conteúdo: detecta duas pessoas editando juntas
  updated_by: 'INTEGER', // quem mudou o conteúdo por último
  deleted_by: 'INTEGER', // quem mandou para a lixeira (pode ser um convidado da pasta)
};
const noteColumns = db.prepare('PRAGMA table_info(notes)').all().map((c) => c.name);
for (const [col, type] of Object.entries(NOTE_MIGRATIONS)) {
  if (!noteColumns.includes(col)) db.exec(`ALTER TABLE notes ADD COLUMN ${col} ${type}`);
}
// Post-its antigos: "repetir todo ano" (repeat_yearly) vira repeat_rule = 'yearly'
db.exec(`UPDATE notes SET repeat_rule = CASE WHEN repeat_yearly = 1 THEN 'yearly' ELSE 'none' END WHERE repeat_rule IS NULL`);

const FOLDER_MIGRATIONS = {
  parent_id: 'INTEGER REFERENCES folders(id) ON DELETE SET NULL', // subpasta de...
  position: 'INTEGER NOT NULL DEFAULT 0', // ordem escolhida pelo usuário
};
const folderColumns = db.prepare('PRAGMA table_info(folders)').all().map((c) => c.name);
for (const [col, type] of Object.entries(FOLDER_MIGRATIONS)) {
  if (!folderColumns.includes(col)) db.exec(`ALTER TABLE folders ADD COLUMN ${col} ${type}`);
}

db.exec(`
  -- Pastas compartilhadas: quem (além do dono) pode ver e editar os post-its da pasta
  CREATE TABLE IF NOT EXISTS folder_members (
    folder_id INTEGER NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    added_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (folder_id, user_id)
  );
  CREATE INDEX IF NOT EXISTS idx_members_user ON folder_members(user_id);
`);

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

// Conta: exclusão com 30 dias para se arrepender, login com Google
const USER_MIGRATIONS = {
  deleted_at: 'TEXT', // pediu para excluir a conta (apagada de vez depois de 30 dias)
  google_sub: 'TEXT', // id da conta Google vinculada
  public_code: 'TEXT', // ID para convidar sem o e-mail (ex.: K7P2-9QXM)
};
const userColumns = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
for (const [col, type] of Object.entries(USER_MIGRATIONS)) {
  if (!userColumns.includes(col)) db.exec(`ALTER TABLE users ADD COLUMN ${col} ${type}`);
}

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_google ON users(google_sub) WHERE google_sub IS NOT NULL;
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_code ON users(public_code) WHERE public_code IS NOT NULL;

  -- Alertas fechados por convidados de pastas compartilhadas (o da dona fica no próprio post-it)
  CREATE TABLE IF NOT EXISTS alert_dismissals (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id INTEGER NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    keys    TEXT NOT NULL DEFAULT '[]',
    PRIMARY KEY (user_id, note_id)
  );

  -- "Esqueci minha senha": guardamos só o hash do código, que vale 30 minutos e uma vez só
  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used_at    TEXT
  );
`);

// Contas antigas (de antes do ID público) ganham o seu na primeira vez que o servidor sobe
{
  const missing = db.prepare('SELECT id FROM users WHERE public_code IS NULL').all();
  const setCode = db.prepare('UPDATE users SET public_code = ? WHERE id = ?');
  for (const { id } of missing) {
    for (;;) {
      try {
        setCode.run(generatePublicCode(), id);
        break;
      } catch {} // colisão (raríssima): tenta outro
    }
  }
}
