import crypto from 'node:crypto';
import { db } from '../config/db.js';

const SESSION_DAYS = 30;

export const SessionModel = {
  create(userId) {
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(
      token,
      userId,
      expiresAt,
    );
    return token;
  },

  findUserByToken(token) {
    return db
      .prepare(
        `SELECT u.id, u.name, u.email, u.created_at
           FROM sessions s JOIN users u ON u.id = s.user_id
          WHERE s.token = ? AND s.expires_at > ?`,
      )
      .get(token, new Date().toISOString());
  },

  remove(token) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  },
};
