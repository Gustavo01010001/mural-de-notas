// Ajudantes só de exibição dos post-its (links, etiquetas, fotos)

// Quebra o texto em pedaços: texto normal e links (http/https/www) clicáveis
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]'"])/gi;

export function linkify(text) {
  if (!text) return [];
  const parts = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index) });
    const raw = m[0];
    parts.push({ text: raw, href: raw.startsWith('www.') ? `https://${raw}` : raw });
    last = m.index + raw.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

// Cada etiqueta sempre tem a mesma cor (calculada a partir do nome)
export function tagColor(tag) {
  let h = 0;
  for (const ch of tag) h = (h * 31 + ch.codePointAt(0)) % 360;
  return `hsl(${h} 70% 38%)`;
}

export function parseTagInput(value) {
  return value
    .split(/[,\s]+/)
    .map((t) => t.replace(/^#+/, '').trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Reduz a foto no próprio navegador antes de enviar (máx. 1100px, JPEG ~80%).
 * Celulares tiram fotos de 4-10 MB; depois disso ficam com ~150-300 KB.
 */
export function compressImage(file, maxSide = 1100, quality = 0.8) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Escolha um arquivo de imagem.'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; // PNG transparente não fica preto no JPEG
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Não consegui abrir essa imagem.'));
    };
    img.src = url;
  });
}

export function daysLeftInTrash(deletedAt, days = 30) {
  if (!deletedAt) return days;
  const deleted = new Date(`${deletedAt.replace(' ', 'T')}Z`).getTime();
  return Math.max(0, Math.ceil(days - (Date.now() - deleted) / 86_400_000));
}
