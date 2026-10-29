// Monta e percorre a árvore de pastas (o back manda uma lista com parentId/position)
export const MAX_DEPTH = 3;

const byPosition = (a, b) => a.position - b.position || a.id - b.id;

export function childrenOf(folders, parentId) {
  return folders.filter((f) => (f.parentId ?? null) === parentId).sort(byPosition);
}

/** Lista "achatada" em ordem de árvore, com a profundidade de cada pasta (1 = principal). */
export function flattenTree(folders, parentId = null, depth = 1, out = []) {
  for (const f of childrenOf(folders, parentId)) {
    out.push({ ...f, depth });
    flattenTree(folders, f.id, depth + 1, out);
  }
  return out;
}

/** Caminho até a pasta: [Faculdade, Cálculo, Provas] */
export function pathOf(folders, id) {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path = [];
  let current = byId.get(id);
  for (let i = 0; current && i < 10; i++) {
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : null;
  }
  return path;
}

export function depthOf(folders, id) {
  return pathOf(folders, id).length;
}

export function subtreeHeight(folders, id) {
  return 1 + Math.max(0, ...childrenOf(folders, id).map((c) => subtreeHeight(folders, c.id)));
}

/** Pastas que podem ser "mãe" de `movingId` (não ela mesma, nem as filhas dela, sem passar de 3 níveis). */
export function validParents(folders, movingId = null) {
  const height = movingId ? subtreeHeight(folders, movingId) : 1;
  const blocked = new Set();
  if (movingId) {
    const walk = (id) => {
      blocked.add(id);
      childrenOf(folders, id).forEach((c) => walk(c.id));
    };
    walk(movingId);
  }
  return flattenTree(folders).filter((f) => !blocked.has(f.id) && f.depth + height <= MAX_DEPTH);
}
