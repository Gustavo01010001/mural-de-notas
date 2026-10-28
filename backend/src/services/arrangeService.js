// "Arrumar mural": calcula uma grade organizada para os post-its de uma pasta.
// Fixados primeiro; depois a ordem em que o usuário já os deixou (de cima para baixo,
// da esquerda para a direita), para a arrumação não "embaralhar" o que ele pensou.

const START_X = 40;
const START_Y = 120;
const GAP = 30;
const DEFAULT_W = 230;
const DEFAULT_H = 230;

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
