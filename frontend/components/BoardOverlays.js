'use client';

// Camadas do mural infinito: setas entre post-its, zonas de assunto (por etiqueta) e minimapa.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { tagColor } from '@/lib/noteHelpers';
import Icon from './Icon';

const DEFAULT_W = 230;
const DEFAULT_H = 210;

// Tamanho real de cada post-it na tela (medido; acompanha quando o texto muda ou alguém redimensiona)
export function useNoteSizes(notes, layerRef) {
  const [sizes, setSizes] = useState({});
  useLayoutEffect(() => {
    const layer = layerRef.current;
    if (!layer) return;
    const measure = () => {
      const next = {};
      layer.querySelectorAll('[data-note-id]').forEach((el) => {
        next[el.dataset.noteId] = { w: el.offsetWidth, h: el.offsetHeight };
      });
      setSizes((prev) => {
        const keys = Object.keys(next);
        if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k]?.w === next[k].w && prev[k]?.h === next[k].h)) return prev;
        return next;
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    layer.querySelectorAll('[data-note-id]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [notes, layerRef]);
  return sizes;
}

// Retângulo do post-it no mural (usa a posição "ao vivo" se ele estiver sendo arrastado)
export function noteRect(note, sizes, drag) {
  const live = drag?.id === note.id ? drag : null;
  const s = sizes[note.id] ?? { w: note.width ?? DEFAULT_W, h: note.height ?? DEFAULT_H };
  return { x: live ? live.x : note.x, y: live ? live.y : note.y, w: s.w, h: s.h };
}

// Ponto na borda do retângulo, na direção de (tx, ty) — a seta começa/termina na borda, não no meio
function edgePoint(r, tx, ty, margin = 8) {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = tx - cx;
  const dy = ty - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? (r.w / 2 + margin) / Math.abs(dx) : Infinity, dy ? (r.h / 2 + margin) / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

function curve(a, b) {
  // arco suave: controle no meio, deslocado para o lado
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  const bend = Math.min(60, len * 0.12);
  const cx = mx - ((b.y - a.y) / len) * bend;
  const cy = my + ((b.x - a.x) / len) * bend;
  return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, mid: { x: (a.x + 2 * cx + b.x) / 4, y: (a.y + 2 * cy + b.y) / 4 } };
}

export function LinksLayer({ links, notes, sizes, drag, preview, onRemove, canEdit = true }) {
  const [hover, setHover] = useState(null);
  const byId = useMemo(() => new Map(notes.map((n) => [n.id, n])), [notes]);

  const drawn = links
    .map((l) => {
      const a = byId.get(l.fromId);
      const b = byId.get(l.toId);
      if (!a || !b) return null;
      const ra = noteRect(a, sizes, drag);
      const rb = noteRect(b, sizes, drag);
      const pa = edgePoint(ra, rb.x + rb.w / 2, rb.y + rb.h / 2);
      const pb = edgePoint(rb, ra.x + ra.w / 2, ra.y + ra.h / 2, 12);
      return { id: l.id, label: `${a.title} → ${b.title}`, ...curve(pa, pb) };
    })
    .filter(Boolean);

  let previewPath = null;
  if (preview?.from && preview.to) {
    const from = byId.get(preview.from);
    if (from) {
      const r = noteRect(from, sizes, drag);
      previewPath = curve(edgePoint(r, preview.to.x, preview.to.y), preview.to).d;
    }
  }

  if (!drawn.length && !previewPath) return null;
  return (
    <svg className="links-layer" aria-hidden={!drawn.length}>
      <defs>
        <marker id="link-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="link-arrow-head" />
        </marker>
      </defs>
      {drawn.map((l) => (
        <g key={l.id} className={`link ${hover === l.id ? 'hover' : ''}`} onMouseEnter={() => setHover(l.id)} onMouseLeave={() => setHover((h) => (h === l.id ? null : h))}>
          <path d={l.d} className="link-line" markerEnd="url(#link-arrow)" vectorEffect="non-scaling-stroke" />
          {/* faixa invisível mais grossa: fácil de passar o mouse/tocar */}
          <path d={l.d} className="link-hit" onClick={() => setHover(l.id)}>
            <title>{l.label}</title>
          </path>
          {canEdit && hover === l.id && (
            <g
              className="link-remove"
              transform={`translate(${l.mid.x} ${l.mid.y})`}
              role="button"
              tabIndex={0}
              aria-label={`Remover conexão ${l.label}`}
              onClick={() => onRemove(l.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRemove(l.id)}
            >
              <circle r="13" />
              <path d="M -4.5 -4.5 L 4.5 4.5 M 4.5 -4.5 L -4.5 4.5" />
            </g>
          )}
        </g>
      ))}
      {previewPath && <path d={previewPath} className="link-preview" vectorEffect="non-scaling-stroke" markerEnd="url(#link-arrow)" />}
    </svg>
  );
}

// Assunto = primeira etiqueta. Zonas só para assuntos com 2+ post-its.
export function subjectGroups(notes, sizes, drag) {
  const groups = new Map();
  for (const n of notes) {
    const tag = n.tags?.[0];
    if (!tag) continue;
    if (!groups.has(tag)) groups.set(tag, []);
    groups.get(tag).push(noteRect(n, sizes, drag));
  }
  return [...groups.entries()]
    .filter(([, rects]) => rects.length >= 2)
    .map(([tag, rects]) => {
      const x = Math.min(...rects.map((r) => r.x)) - 22;
      const y = Math.min(...rects.map((r) => r.y)) - 48;
      const right = Math.max(...rects.map((r) => r.x + r.w)) + 22;
      const bottom = Math.max(...rects.map((r) => r.y + r.h)) + 22;
      return { tag, count: rects.length, x, y, w: right - x, h: bottom - y };
    });
}

export function SubjectZones({ notes, sizes, drag, onPick }) {
  const zones = subjectGroups(notes, sizes, drag);
  return (
    <AnimatePresence>
      {zones.map((z) => (
        <motion.div
          key={z.tag}
          className="subject-zone"
          style={{ left: z.x, top: z.y, width: z.w, height: z.h, '--zone': tagColor(z.tag) }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          <button type="button" className="subject-zone-label" onClick={() => onPick?.(z.tag)} title={`Mostrar só #${z.tag}`}>
            #{z.tag} <small>{z.count}</small>
          </button>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

// ---------- minimapa ----------
const MAP_W = 210;
const MAP_H = 140;

export function Minimap({ notes, sizes, drag, boardRef, board, boardTop, onClose }) {
  const [view, setView] = useState(null);
  const dragging = useRef(false);

  // onde está a tela agora (em coordenadas do mural)
  const read = useCallback(() => {
    const el = boardRef.current;
    if (!el) return;
    const z = board.getZoom();
    setView({ x: el.scrollLeft / z, y: (el.scrollTop - boardTop) / z, w: el.clientWidth / z, h: (el.clientHeight - boardTop) / z });
  }, [boardRef, board, boardTop]);

  useEffect(() => {
    read();
    let raf = 0;
    const off = board.subscribe(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(read);
    });
    window.addEventListener('resize', read);
    return () => {
      off();
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', read);
    };
  }, [board, read]);

  const rects = notes.map((n) => ({ n, r: noteRect(n, sizes, drag) }));
  if (!view) return null;
  // área desenhada: todos os post-its + a parte que está na tela, com folga
  const minX = Math.min(view.x, ...rects.map(({ r }) => r.x)) - 120;
  const minY = Math.min(view.y, ...rects.map(({ r }) => r.y)) - 120;
  const maxX = Math.max(view.x + view.w, ...rects.map(({ r }) => r.x + r.w)) + 120;
  const maxY = Math.max(view.y + view.h, ...rects.map(({ r }) => r.y + r.h)) + 120;
  const scale = Math.min(MAP_W / (maxX - minX), MAP_H / (maxY - minY));
  const ox = (MAP_W - (maxX - minX) * scale) / 2;
  const oy = (MAP_H - (maxY - minY) * scale) / 2;
  const toMap = (x, y) => ({ x: ox + (x - minX) * scale, y: oy + (y - minY) * scale });

  const jump = (e, animate) => {
    const box = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - box.left;
    const my = e.clientY - box.top;
    board.panTo(minX + (mx - ox) / scale, minY + (my - oy) / scale, { animate });
  };

  const v = toMap(view.x, view.y);
  return (
    <motion.div className="minimap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
      <div className="minimap-head">
        <span>
          <Icon name="map" size={13} /> Minimapa
        </span>
        <button type="button" onClick={onClose} aria-label="Esconder minimapa" title="Esconder minimapa">
          <Icon name="x" size={13} />
        </button>
      </div>
      <svg
        width={MAP_W}
        height={MAP_H}
        className="minimap-canvas"
        role="img"
        aria-label="Mapa do mural: clique ou arraste para ir a outra parte"
        onPointerDown={(e) => {
          dragging.current = true;
          try {
            e.currentTarget.setPointerCapture(e.pointerId);
          } catch {}
          jump(e, false);
        }}
        onPointerMove={(e) => dragging.current && jump(e, false)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        {rects.map(({ n, r }) => {
          const p = toMap(r.x, r.y);
          return <rect key={n.id} x={p.x} y={p.y} width={Math.max(2, r.w * scale)} height={Math.max(2, r.h * scale)} rx="1.5" style={{ fill: `var(--${n.color})` }} />;
        })}
        <rect className="minimap-view" x={v.x} y={v.y} width={Math.max(6, view.w * scale)} height={Math.max(6, view.h * scale)} rx="3" />
      </svg>
    </motion.div>
  );
}
