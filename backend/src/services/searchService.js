import { NoteModel } from '../models/noteModel.js';
import { FolderModel } from '../models/folderModel.js';
import { occurrencesBetween, todayIn } from '../utils/dates.js';
import { parseDateTerms } from '../utils/dateQuery.js';
import { normalize } from '../utils/text.js';

export { normalize };

const MAX_RESULTS = 40;

function visibleFolders(userId) {
  return new Map([...FolderModel.listByUser(userId), ...FolderModel.listSharedWith(userId)].map((f) => [f.id, f]));
}

/**
 * Procura nos post-its do usuário e das pastas compartilhadas com ele.
 * - Palavras: todas precisam aparecer (título pesa mais); "#etiqueta" procura só nas etiquetas.
 * - Datas na busca ("outubro", "25/12", "hoje") filtram pelas ocorrências (contando repetições).
 * - Filtros: cor, pasta (null = Mural geral), etiqueta, só com data.
 */
export function searchNotes(userId, query, filters = {}, tz) {
  const today = todayIn(tz);
  const parsed = parseDateTerms(normalize(query).split(/\s+/).filter(Boolean).slice(0, 10), today);
  const { terms, range } = parsed;
  const hasFilter = filters.color || filters.folder !== undefined || filters.tag || filters.hasDate;
  if (!terms.length && !range && !hasFilter) return { results: [], dateLabel: null };

  const folders = visibleFolders(userId);
  const notes = NoteModel.listSearchable(userId, FolderModel.sharedFolderIds(userId));

  const results = notes
    .map((note) => {
      if (filters.color && note.color !== filters.color) return null;
      if (filters.folder !== undefined && (note.folderId ?? null) !== filters.folder) return null;
      if (filters.tag && !note.tags.includes(filters.tag)) return null;
      if (filters.hasDate && !note.eventDate) return null;
      if (note.folderId && !folders.has(note.folderId)) return null; // pasta que não vejo mais

      let score = 0;
      if (range) {
        const hits = note.eventDate ? occurrencesBetween(note.eventDate, note.repeat, range.from, range.to) : [];
        if (!hits.length) return null;
        score += 3;
      }

      const title = normalize(note.title);
      // checklist também conta como texto do post-it
      const content = normalize([note.content, ...note.checklist.map((i) => i.text)].join(' '));
      const tags = note.tags.map(normalize);
      for (const t of terms) {
        if (t.startsWith('#')) {
          if (!tags.includes(t.slice(1))) return null;
          score += 4;
          continue;
        }
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
        updated: note.updatedAt,
        note: {
          ...note,
          folderName: folder?.name ?? 'Mural geral',
          folderIcon: folder?.icon ?? '📌',
          sharedBy: folder && folder.ownerId !== userId ? folder.ownerName : undefined,
        },
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score || (b.updated > a.updated ? 1 : -1))
    .slice(0, MAX_RESULTS)
    .map((r) => r.note);

  return { results, dateLabel: parsed.label };
}

// Etiquetas usadas (minhas e das pastas compartilhadas), das mais usadas para as menos
export function listTags(userId) {
  const count = new Map();
  for (const n of NoteModel.listSearchable(userId, FolderModel.sharedFolderIds(userId))) {
    for (const t of n.tags) count.set(t, (count.get(t) ?? 0) + 1);
  }
  return [...count].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([tag, uses]) => ({ tag, uses }));
}
