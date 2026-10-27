// Marca as palavras buscadas no texto (ignorando acento e maiúscula), só para exibição
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function marksFor(text, query) {
  const terms = norm(query).split(/\s+/).filter(Boolean);
  const marks = new Array(text.length).fill(false);
  if (!terms.length) return marks;

  // texto normalizado + de qual caractere original veio cada letra
  let flat = '';
  const map = [];
  for (let i = 0; i < text.length; i++) {
    for (const ch of norm(text[i])) {
      flat += ch;
      map.push(i);
    }
  }
  for (const term of terms) {
    let idx = flat.indexOf(term);
    while (idx !== -1) {
      for (let k = idx; k < idx + term.length; k++) marks[map[k]] = true;
      idx = flat.indexOf(term, idx + term.length);
    }
  }
  return marks;
}

function toSegments(text, marks) {
  const out = [];
  for (let i = 0; i < text.length; i++) {
    const last = out[out.length - 1];
    if (last && last.match === marks[i]) last.text += text[i];
    else out.push({ text: text[i], match: marks[i] });
  }
  return out;
}

export function highlight(text, query) {
  return toSegments(text, marksFor(text, query));
}

// Trecho do texto em volta da primeira palavra encontrada
export function snippet(text, query, size = 90) {
  if (!text) return [];
  const marks = marksFor(text, query);
  const first = marks.indexOf(true);
  if (first === -1 || text.length <= size) {
    const cut = text.length > size ? `${text.slice(0, size)}…` : text;
    return toSegments(cut, marks.slice(0, cut.length));
  }
  const start = Math.max(0, first - 30);
  const end = Math.min(text.length, start + size);
  const segs = toSegments(text.slice(start, end), marks.slice(start, end));
  if (start > 0) segs.unshift({ text: '…', match: false });
  if (end < text.length) segs.push({ text: '…', match: false });
  return segs;
}
