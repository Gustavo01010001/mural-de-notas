import crypto from 'node:crypto';
import { db } from '../config/db.js';

const SESSION_DAYS = 30;

// No banco fica só o hash do token: se o arquivo do banco vazar, as sessões não servem para nada
const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export const SessionModel = {
  create(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, expiresAt);
    return token;
  },

  findUserByToken(token) {
    return db
      .prepare(
        `SELECT u.id, u.name, u.email, u.created_at, u.google_sub IS NOT NULL AS has_google, u.password_hash != '!' AS has_password
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ? AND u.deleted_at IS NULL`,
      )
      .get(hashToken(token), new Date().toISOString());
  },

  remove(token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(hashToken(token));
  },

  // Trocou a senha: derruba todas as sessões (menos, opcionalmente, a atual)
  removeAllForUser(userId, exceptToken = null) {
    if (exceptToken) db.prepare('DELETE FROM sessions WHERE user_id = ? AND token != ?').run(userId, hashToken(exceptToken));
    else db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
  },

  purgeExpired() {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString());
  },
};

export const SESSION_MAX_AGE_MS = SESSION_DAYS * 86_400_000;
