import crypto from 'node:crypto';
import { db } from '../config/db.js';
import { generatePublicCode } from '../utils/publicCode.js';

export const ACCOUNT_GRACE_DAYS = 30; // excluir conta: 30 dias para se arrepender

const PUBLIC_FIELDS = `id, name, email, public_code, created_at, deleted_at, google_sub IS NOT NULL AS has_google, password_hash != '!' AS has_password`;

const toUser = (row) =>
  row && {
    id: row.id,
    name: row.name,
    email: row.email,
    code: row.public_code ?? null,
    created_at: row.created_at,
    deletedAt: row.deleted_at ?? null,
    hasGoogle: Boolean(row.has_google),
    hasPassword: Boolean(row.has_password),
  };

export const UserModel = {
  create({ name, email, passwordHash, googleSub = null }) {
    const insert = db.prepare('INSERT INTO users (name, email, password_hash, google_sub, public_code) VALUES (?, ?, ?, ?, ?)');
    for (let tries = 0; ; tries++) {
      try {
        const result = insert.run(name, email, passwordHash, googleSub, generatePublicCode());
        return this.findById(Number(result.lastInsertRowid));
      } catch (err) {
        // ID repetido (raríssimo): sorteia outro; e-mail repetido continua sendo erro
        if (tries > 5 || !String(err.message).includes('public_code')) throw err;
      }
    }
  },

  findById(id) {
    return toUser(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id));
  },

  updateName(id, name) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
    return this.findById(id);
  },

  // Sem o hash: para convidar alguém para uma pasta (contas em exclusão não aparecem)
  findByEmail(email) {
    return toUser(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE email = ? AND deleted_at IS NULL`).get(email));
  },

  // Convidar pelo ID público (contas em exclusão não aparecem)
  findByCode(code) {
    return toUser(db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE public_code = ? AND deleted_at IS NULL`).get(code));
  },

  // Inclui o hash: usado só no login / confirmação de senha
  findByEmailWithPassword(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },

  findRawById(id) {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  },

  setPassword(id, passwordHash) {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
  },

  // ----- Google -----
  findByGoogleSub(sub) {
    return db.prepare('SELECT * FROM users WHERE google_sub = ?').get(sub);
  },

  linkGoogle(id, sub) {
    db.prepare('UPDATE users SET google_sub = ? WHERE id = ?').run(sub, id);
  },

  // ----- exclusão de conta (com prazo para voltar atrás) -----
  markDeleted(id) {
    db.prepare(`UPDATE users SET deleted_at = datetime('now') WHERE id = ?`).run(id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
  },

  restore(id) {
    db.prepare('UPDATE users SET deleted_at = NULL WHERE id = ?').run(id);
  },

  // Apaga de vez contas excluídas há mais de 30 dias (post-its, pastas... vão junto)
  purgeDeleted() {
    return db
      .prepare(`DELETE FROM users WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?)`)
      .run(`-${ACCOUNT_GRACE_DAYS} days`).changes;
  },

  // ----- "esqueci minha senha" -----
  createResetToken(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(userId); // só o último link vale
    db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
      hash,
      userId,
      new Date(Date.now() + 30 * 60_000).toISOString(),
    );
    return token;
  },

  // Usa o código (uma vez só, dentro do prazo) e devolve o id do usuário
  consumeResetToken(token) {
    const hash = crypto.createHash('sha256').update(String(token)).digest('hex');
    const row = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(hash);
    if (!row || row.used_at || row.expires_at < new Date().toISOString()) return null;
    db.prepare(`UPDATE password_resets SET used_at = datetime('now') WHERE token_hash = ?`).run(hash);
    return row.user_id;
  },
};
