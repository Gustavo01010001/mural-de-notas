// Backup automático do banco: uma cópia por dia em backend/data/backups (guarda as últimas 7).
// Usa "VACUUM INTO", que tira uma foto consistente do banco mesmo com o servidor rodando.
// A pasta data/ não vai para o GitHub (.gitignore).
import fs from 'node:fs';
import path from 'node:path';
import { db, dataDir } from '../config/db.js';

const KEEP = Number(process.env.BACKUP_KEEP || 7);
const DAY = 24 * 60 * 60_000;
export const backupDir = path.join(dataDir, 'backups');

const stamp = (d = new Date()) => d.toISOString().slice(0, 19).replace(/[:T]/g, '-');

export function listBackups() {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => /^notas-.*\.db$/.test(f))
    .map((f) => ({ file: f, at: fs.statSync(path.join(backupDir, f)).mtimeMs }))
    .sort((a, b) => b.at - a.at);
}

export function backupNow() {
  fs.mkdirSync(backupDir, { recursive: true });
  const file = path.join(backupDir, `notas-${stamp()}.db`);
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
  // apaga os mais antigos
  for (const old of listBackups().slice(KEEP)) fs.rmSync(path.join(backupDir, old.file), { force: true });
  return file;
}

// Faz um backup se o último tiver mais de 1 dia; depois repete todo dia
export function startAutomaticBackups() {
  if (process.env.BACKUP_DISABLED === '1') return;
  const run = () => {
    try {
      const last = listBackups()[0];
      if (!last || Date.now() - last.at > DAY - 60_000) console.log(`[backup] cópia do banco salva em ${backupNow()}`);
    } catch (err) {
      console.error('[backup] falhou:', err.message);
    }
  };
  run();
  setInterval(run, 60 * 60_000).unref(); // confere de hora em hora
}
