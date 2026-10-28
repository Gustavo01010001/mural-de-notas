import { NoteModel } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';

const MAX_RESULTS = 30;

// "Aniversário" e "aniversario" contam como a mesma palavra
export const normalize = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/**
 * Procura palavras-chave no título e no texto de todos os post-its do usuário (em todas as pastas).
 * Todas as palavras precisam aparecer. Título pesa mais que o texto no ranking.
 */
export function searchNotes(userId, query) {
  const terms = normalize(query).split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0) return [];

  const folders = new Map(FolderModel.listByUser(userId).map((f) => [f.id, f]));

  return NoteModel.listSearchable(userId)
    .map((note) => {
      const title = normalize(note.title);
      // checklist também conta como texto do post-it
      const content = normalize([note.content, ...note.checklist.map((i) => i.text)].join(' '));
      const tags = note.tags.map(normalize);
      let score = 0;
      for (const raw of terms) {
        // "#urgente" procura só nas etiquetas
        if (raw.startsWith('#')) {
          if (!tags.includes(raw.slice(1))) return null;
          score += 4;
          continue;
        }
        const t = raw;
        const inTitle = title.includes(t);
        const inContent = content.includes(t);
        const inTags = tags.some((tag) => tag.includes(t));
        if (!inTitle && !inContent && !inTags) return null;
        score += (inTitle ? 3 : 0) + (inContent ? 1 : 0) + (inTags ? 2 : 0) + (title.startsWith(t) ? 2 : 0);
      }
      if (note.status === 'archived') score -= 1; // arquivados aparecem, mas depois
      const folder = note.folderId ? folders.get(note.folderId) : null;
      return {
        score,
        note: {
          ...note,
          folderName: folder?.name ?? 'Mural geral',
          folderIcon: folder?.icon ?? '📌',
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_RESULTS)
    .map((r) => r.note);
}
