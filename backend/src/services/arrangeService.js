// "Arrumar mural": calcula uma grade organizada para os post-its de uma pasta.
// Fixados primeiro; depois a ordem em que o usuário já os deixou (de cima para baixo,
// da esquerda para a direita), para a arrumação não "embaralhar" o que ele pensou.

const START_X = 40;
const START_Y = 40; // o mural já começa abaixo da barra do topo
const GAP = 30;
const DEFAULT_W = 230;
const DEFAULT_H = 230;
const GROUP_GAP = 90; // espaço entre assuntos (cabe o rótulo do grupo)
const LABEL_SPACE = 44; // altura reservada para o "#assunto" em cima de cada grupo

function readingOrder(a, b) {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
  const rowA = Math.round(a.y / 180);
  const rowB = Math.round(b.y / 180);
  return rowA - rowB || a.x - b.x || a.id - b.id;
}

export function arrangeNotes(notes, columns) {
  const sorted = [...notes].sort(readingOrder);
  const colWidth = Math.max(DEFAULT_W, ...sorted.map((n) => n.width ?? DEFAULT_W)) + GAP;
  const positions = [];
  let y = START_Y;

  for (let i = 0; i < sorted.length; i += columns) {
    const row = sorted.slice(i, i + columns);
    row.forEach((n, col) => positions.push({ id: n.id, x: START_X + col * colWidth, y }));
    y += Math.max(...row.map((n) => n.height ?? DEFAULT_H)) + GAP + 20; // +20 para checklist/etiquetas
  }
  return positions;
}

// Assunto de um post-it = a primeira etiqueta (sem etiqueta = null)
export const subjectOf = (note) => (note.tags?.[0] ? String(note.tags[0]).toLowerCase() : null);

/**
 * "Organizar por assunto": junta os post-its pela primeira etiqueta.
 * Cada assunto vira um bloco em grade (quase quadrado); os blocos são colocados lado a lado
 * e quebram de linha quando passam da largura de `columns` post-its.
 * Assuntos com mais post-its vêm primeiro. Etiqueta que aparece num post-it só não vira bloco
 * (seria um monte de blocos de 1): vai para o bloco final "outros", junto com os sem etiqueta.
 */
export function arrangeBySubject(notes, columns) {
  const colWidth = Math.max(DEFAULT_W, ...notes.map((n) => n.width ?? DEFAULT_W)) + GAP;
  const groups = new Map();
  const count = new Map();
  for (const n of notes) count.set(subjectOf(n), (count.get(subjectOf(n)) ?? 0) + 1);
  for (const n of [...notes].sort(readingOrder)) {
    const s = subjectOf(n);
    const key = s !== null && count.get(s) >= 2 ? s : null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  }
  const ordered = [...groups.entries()].sort(([ka, a], [kb, b]) => {
    if ((ka === null) !== (kb === null)) return ka === null ? 1 : -1;
    return b.length - a.length || String(ka).localeCompare(String(kb), 'pt-BR');
  });

  const maxWidth = Math.max(1, columns) * colWidth;
  const positions = [];
  const blocks = [];
  let x = START_X;
  let y = START_Y;
  let rowHeight = 0;

  for (const [subject, list] of ordered) {
    const cols = Math.min(list.length, Math.max(1, Math.ceil(Math.sqrt(list.length))), Math.max(1, columns));
    const width = cols * colWidth - GAP;
    const rows = [];
    for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols));
    const height = LABEL_SPACE + rows.reduce((h, r) => h + Math.max(...r.map((n) => n.height ?? DEFAULT_H)) + GAP + 20, 0);

    // não cabe nesta linha de blocos: desce
    if (x > START_X && x + width > START_X + maxWidth) {
      x = START_X;
      y += rowHeight + GROUP_GAP;
      rowHeight = 0;
    }
    let ny = y + LABEL_SPACE;
    for (const r of rows) {
      r.forEach((n, col) => positions.push({ id: n.id, x: x + col * colWidth, y: ny }));
      ny += Math.max(...r.map((n) => n.height ?? DEFAULT_H)) + GAP + 20;
    }
    blocks.push({ subject, count: list.length, x, y, width, height });
    x += width + GROUP_GAP;
    rowHeight = Math.max(rowHeight, height);
  }
  return { positions, groups: blocks };
}
