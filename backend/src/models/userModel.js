import { db } from '../config/db.js';

const PUBLIC_FIELDS = 'id, name, email, created_at';

export const UserModel = {
  create({ name, email, passwordHash }) {
    const result = db
      .prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)')
      .run(name, email, passwordHash);
    return this.findById(Number(result.lastInsertRowid));
  },

  findById(id) {
    return db.prepare(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = ?`).get(id);
  },

  updateName(id, name) {
    db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name, id);
    return this.findById(id);
  },

  // Inclui o hash: usado só no login
  findByEmailWithPassword(email) {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  },
};
