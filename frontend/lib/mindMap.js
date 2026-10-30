// "Organizar como mapa de ideias" (quadro de detetive): nem grade, nem bagunça.
// - Cada grupo de post-its ligados vira um "mapa": o que tem mais ligações fica no centro e os ligados
//   ficam em anéis ao redor (cada ramo na sua fatia, para os fios não se cruzarem à toa).
// - Depois, um ajuste empurra quem ficou encostado em outro (nada fica por cima de nada).
// - Os post-its sem ligação vão para o fim, em fileiras soltas com leve desalinhamento (cara de mural
//   de cortiça, não de planilha).

const DEFAULT = { w: 230, h: 210 };
const GAP = 56; // folga mínima entre dois post-its (o fio passa no meio)
const RING = 440; // distância entre um anel e o próximo (folga para os fios aparecerem entre os post-its)
const GROUP_GAP = 160;

// número "aleatório" fixo por post-it (o mesmo post-it sempre cai no mesmo lugar)
const jitter = (id, salt, amp) => {
  const s = Math.sin(id * 12.9898 + salt * 78.233) * 43758.5453;
  return (s - Math.floor(s) - 0.5) * 2 * amp;
};

function components(ids, adj) {
  const seen = new Set();
  const groups = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const group = [];
    const queue = [id];
    seen.add(id);
    while (queue.length) {
      const cur = queue.shift();
      group.push(cur);
      for (const nb of adj.get(cur)) if (!seen.has(nb)) (seen.add(nb), queue.push(nb));
    }
    groups.push(group);
  }
  return groups;
}

// Árvore radial: cada nó ganha uma fatia do círculo proporcional ao tamanho do seu ramo
function radial(group, adj) {
  const hub = [...group].sort((a, b) => adj.get(b).size - adj.get(a).size || a - b)[0];
  const parent = new Map([[hub, null]]);
  const depth = new Map([[hub, 0]]);
  const children = new Map(group.map((id) => [id, []]));
  const queue = [hub];
  while (queue.length) {
    const cur = queue.shift();
    // vizinhos com mais ligações primeiro (ficam mais perto do centro do ramo)
    const nbs = [...adj.get(cur)].filter((n) => !parent.has(n)).sort((a, b) => adj.get(b).size - adj.get(a).size || a - b);
    for (const nb of nbs) {
      parent.set(nb, cur);
      depth.set(nb, depth.get(cur) + 1);
      children.get(cur).push(nb);
      queue.push(nb);
    }
  }
  const leaves = new Map();
  const countLeaves = (id) => {
    const kids = children.get(id);
    const n = kids.length ? kids.reduce((s, k) => s + countLeaves(k), 0) : 1;
    leaves.set(id, n);
    return n;
  };
  countLeaves(hub);

  const pos = new Map([[hub, { x: 0, y: 0 }]]);
  const place = (id, from, to) => {
    const kids = children.get(id);
    const total = kids.reduce((s, k) => s + leaves.get(k), 0) || 1;
    let a = from;
    for (const k of kids) {
      const span = ((to - from) * leaves.get(k)) / total;
      const angle = a + span / 2;
      const d = depth.get(k);
      // anel grande o bastante para caber todo mundo daquele nível sem encostar
      const sameLevel = group.filter((g) => depth.get(g) === d).length;
      const r = Math.max(d * RING, (sameLevel * (DEFAULT.w + GAP)) / (2 * Math.PI));
      pos.set(k, { x: Math.cos(angle) * r, y: Math.sin(angle) * r * 0.82 }); // um pouco achatado: telas são largas
      place(k, a, a + span);
      a += span;
    }
  };
  place(hub, -Math.PI / 2, (3 * Math.PI) / 2);
  return pos;
}

// Empurra post-its que ficaram encostados (algumas rodadas bastam)
function separate(items) {
  for (let round = 0; round < 60; round++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) {
      for (let j = i + 1; j < items.length; j++) {
        const A = items[i];
        const B = items[j];
        const ox = Math.min(A.x + A.w, B.x + B.w) - Math.max(A.x, B.x) + GAP;
        const oy = Math.min(A.y + A.h, B.y + B.h) - Math.max(A.y, B.y) + GAP;
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        // empurra pelo lado que precisa de menos movimento
        if (ox < oy) {
          const push = ox / 2 + 1;
          const dir = A.x + A.w / 2 <= B.x + B.w / 2 ? -1 : 1;
          A.x += dir * push;
          B.x -= dir * push;
        } else {
          const push = oy / 2 + 1;
          const dir = A.y + A.h / 2 <= B.y + B.h / 2 ? -1 : 1;
          A.y += dir * push;
          B.y -= dir * push;
        }
      }
    }
    if (!moved) break;
  }
}

/**
 * @param notes  post-its da pasta
 * @param links  [{ fromId, toId }]
 * @param sizes  { [id]: { w, h } } tamanhos medidos na tela
 * @param maxWidth largura (em px do mural) antes de quebrar para a próxima fileira de mapas
 * @returns { positions: [{ id, x, y }], maps: número de mapas montados }
 */
export function mindMapLayout(notes, links, sizes, { maxWidth = 2600, startX = 60, startY = 60 } = {}) {
  const ids = notes.map((n) => n.id);
  const present = new Set(ids);
  const adj = new Map(ids.map((id) => [id, new Set()]));
  for (const l of links) {
    if (present.has(l.fromId) && present.has(l.toId) && l.fromId !== l.toId) {
      adj.get(l.fromId).add(l.toId);
      adj.get(l.toId).add(l.fromId);
    }
  }
  const size = (id) => sizes[id] ?? DEFAULT;
  const groups = components(ids, adj).sort((a, b) => b.length - a.length);
  const maps = groups.filter((g) => g.length >= 2);
  const loose = groups.filter((g) => g.length === 1).map((g) => g[0]);

  const blocks = [];
  for (const group of maps) {
    const pos = radial(group, adj);
    const items = group.map((id) => {
      const p = pos.get(id);
      const s = size(id);
      return { id, x: p.x - s.w / 2, y: p.y - s.h / 2, w: s.w, h: s.h };
    });
    separate(items);
    const minX = Math.min(...items.map((i) => i.x));
    const minY = Math.min(...items.map((i) => i.y));
    for (const i of items) {
      i.x -= minX;
      i.y -= minY;
    }
    blocks.push({ items, w: Math.max(...items.map((i) => i.x + i.w)), h: Math.max(...items.map((i) => i.y + i.h)) });
  }

  // avulsos: fileiras soltas, levemente desalinhadas
  if (loose.length) {
    const cols = Math.max(2, Math.min(8, Math.round(Math.sqrt(loose.length * 1.8))));
    const cellW = Math.max(...loose.map((id) => size(id).w)) + GAP + 26;
    const items = [];
    let y = 0;
    for (let i = 0; i < loose.length; i += cols) {
      const row = loose.slice(i, i + cols);
      const rowH = Math.max(...row.map((id) => size(id).h));
      row.forEach((id, c) => {
        const s = size(id);
        items.push({ id, x: c * cellW + 12 + jitter(id, 1, 12), y: y + 10 + jitter(id, 2, 14), w: s.w, h: s.h });
      });
      y += rowH + GAP + 30;
    }
    blocks.push({ items, w: Math.max(...items.map((i) => i.x + i.w)), h: Math.max(...items.map((i) => i.y + i.h)), loose: true });
  }

  // encaixa os blocos lado a lado, quebrando de fileira na largura máxima
  const positions = [];
  let x = startX;
  let y = startY;
  let rowH = 0;
  for (const b of blocks) {
    if (x > startX && x + b.w > startX + maxWidth) {
      x = startX;
      y += rowH + GROUP_GAP;
      rowH = 0;
    }
    for (const i of b.items) positions.push({ id: i.id, x: Math.round(x + i.x), y: Math.round(y + i.y) });
    x += b.w + GROUP_GAP;
    rowH = Math.max(rowH, b.h);
  }
  return { positions, maps: maps.length };
}
