'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { countdownLabel, eventIcon, formatEventDate, googleCalendarUrl, repeatLabel } from '@/lib/format';
import { linkify, tagColor } from '@/lib/noteHelpers';
import { noteImageUrl } from '@/lib/api';
import Icon from './Icon';

// Elementos dentro do post-it que não devem começar um arrasto
const INTERACTIVE = 'button, input, a, label, .resize-handle, .postit-menu';

function NoteImage({ note }) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    noteImageUrl(note.id, note.updatedAt)
      .then((url) => alive && setSrc(url))
      .catch(() => alive && setSrc(null));
    return () => {
      alive = false;
    };
  }, [note.id, note.updatedAt]);
  if (!src) return <div className="postit-image loading" />;
  return <img className="postit-image" src={src} alt={`Foto do post-it ${note.title}`} draggable={false} />;
}

function Linked({ text }) {
  return linkify(text).map((p, i) =>
    p.href ? (
      <a key={i} href={p.href} target="_blank" rel="noopener noreferrer nofollow" onClick={(e) => e.stopPropagation()}>
        {p.text}
      </a>
    ) : (
      <span key={i}>{p.text}</span>
    ),
  );
}

// grid = modo "grade" do celular: o post-it entra no fluxo da página (sem arrastar),
// mas mantém as animações de entrada, toque e o "respirar"
export default function PostIt({
  note,
  calm = false,
  found = false,
  grid = false,
  index = 0,
  zoom = 1,
  selecting = false,
  selected = false,
  arranging = false,
  onMove,
  onResize,
  onEdit,
  onDelete,
  onFocus,
  onPin,
  onArchive,
  onDuplicate,
  onToggleCheck,
  onTagClick,
  onSelect,
  onDragStart,
  onDrop,
}) {
  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [size, setSize] = useState({ width: note.width, height: note.height });
  const [dragging, setDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const drag = useRef(null);
  const resize = useRef(null);
  const menuRef = useRef(null);
  const justDragged = useRef(false); // o clique que vem logo depois de arrastar não abre a edição

  // Atualiza posição/tamanho se o back devolver outro (mas não no meio do arrasto)
  useEffect(() => {
    if (!drag.current) setPos({ x: note.x, y: note.y });
  }, [note.x, note.y]);
  useEffect(() => {
    if (!resize.current) setSize({ width: note.width, height: note.height });
  }, [note.width, note.height]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e) => !menuRef.current?.contains(e.target) && setMenuOpen(false);
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  // ----- arrastar -----
  function handleDown(e) {
    if (e.button !== 0 || e.target.closest(INTERACTIVE)) return;
    if (selecting || e.shiftKey || e.ctrlKey || e.metaKey) return; // clique vira seleção
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    setDragging(true);
    onFocus(note.id);
  }

  function handleMove(e) {
    const d = drag.current;
    if (!d) return;
    // com zoom, 1px na tela não é 1px no mural
    const dx = (e.clientX - d.sx) / zoom;
    const dy = (e.clientY - d.sy) / zoom;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 3) {
      d.moved = true;
      onDragStart?.(note); // mostra a faixa de pastas para soltar
    }
    setPos({ x: Math.max(0, d.ox + dx), y: Math.max(0, d.oy + dy) });
  }

  function handleUp(e) {
    const d = drag.current;
    drag.current = null;
    justDragged.current = !!d?.moved;
    setDragging(false);
    if (d?.moved && onDrop?.(note, e.clientX, e.clientY)) {
      // soltou em cima de uma pasta: o post-it vai para lá (não salva posição aqui)
      setPos({ x: d.ox, y: d.oy });
      return;
    }
    if (d?.moved) {
      onMove(note.id, {
        x: Math.max(0, d.ox + (e.clientX - d.sx) / zoom),
        y: Math.max(0, d.oy + (e.clientY - d.sy) / zoom),
      });
    }
  }

  function handleClick(e) {
    const wasDrag = justDragged.current;
    justDragged.current = false;
    if (e.target.closest(INTERACTIVE)) return;
    if (selecting || e.shiftKey || e.ctrlKey || e.metaKey) return onSelect(note.id);
    // no toque não existe duplo clique "natural": um toque no post-it já abre para editar
    if (!wasDrag && window.matchMedia('(hover: none)').matches) onEdit(note);
  }

  // ----- redimensionar (canto inferior direito) -----
  function resizeDown(e) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const box = e.currentTarget.parentElement.getBoundingClientRect();
    resize.current = { sx: e.clientX, sy: e.clientY, w: box.width / zoom, h: box.height / zoom };
  }
  function resizeMove(e) {
    const r = resize.current;
    if (!r) return;
    setSize({
      width: Math.min(520, Math.max(160, r.w + (e.clientX - r.sx) / zoom)),
      height: Math.min(640, Math.max(140, r.h + (e.clientY - r.sy) / zoom)),
    });
  }
  function resizeUp() {
    if (!resize.current) return;
    resize.current = null;
    onResize(note.id, size);
  }

  const done = note.checklist.filter((i) => i.done).length;
  const total = note.checklist.length;
  const countdown = countdownLabel(note);
  const floatDelay = `${-(note.id % 7) * 0.9}s`; // cada post-it flutua num ritmo diferente
  const className = [
    'postit',
    `postit-${note.color}`,
    grid && 'in-grid',
    dragging && 'is-dragging',
    note.isToday && 'is-today',
    found && 'is-found',
    note.pinned && 'is-pinned',
    selected && 'is-selected',
    selecting && 'is-selecting',
  ]
    .filter(Boolean)
    .join(' ');

  const motionProps = grid
    ? {
        layout: true, // quando um post-it some/entra, os outros deslizam para o lugar
        style: { '--float-delay': floatDelay },
        initial: { opacity: 0, y: 40, scale: 0.85, rotate: note.rotation * 0.4 - 8 },
        // entrada em "cascata": cada post-it chega um pouquinho depois do anterior
        animate: {
          opacity: 1,
          y: 0,
          scale: 1,
          rotate: note.rotation * 0.4,
          transition: { type: 'spring', stiffness: 260, damping: 22, delay: Math.min(index, 12) * 0.04 },
        },
        exit: { opacity: 0, scale: 0.6, rotate: note.rotation + 40, transition: { duration: 0.3 } },
        whileTap: selecting ? { scale: 0.95 } : { scale: 0.97, rotate: 0 },
        transition: { type: 'spring', stiffness: 300, damping: 24 },
      }
    : {
        // "Arrumar mural": os post-its deslizam até o lugar novo
        layout: arranging ? 'position' : false,
        style: {
          left: pos.x,
          top: pos.y,
          width: size.width ?? undefined,
          minHeight: size.height ?? undefined,
          zIndex: dragging ? 99999 : note.z + (note.pinned ? 50000 : 0),
          '--float-delay': floatDelay,
        },
        initial: { opacity: 0, scale: 0.3, y: -140, rotate: note.rotation - 30 },
        animate: { opacity: 1, scale: dragging ? 1.08 : 1, y: 0, rotate: dragging ? 0 : note.rotation },
        exit: { opacity: 0, scale: 0.1, rotate: note.rotation + 200, filter: 'blur(4px)', transition: { duration: 0.45 } },
        whileHover: dragging || selecting ? undefined : { scale: 1.04, rotate: 0, y: -6 },
        transition: { type: 'spring', stiffness: 260, damping: 18 },
        onPointerDown: handleDown,
        onPointerMove: handleMove,
        onPointerUp: handleUp,
        onPointerCancel: handleUp,
        title: 'Arraste para mover • Duplo clique para editar • Shift+clique para selecionar',
      };

  return (
    <motion.div
      className={className}
      data-note-id={note.id}
      {...motionProps}
      onClick={handleClick}
      onDoubleClick={(e) => !e.target.closest(INTERACTIVE) && !selecting && onEdit(note)}
    >
      {note.pinned ? <span className="postit-pin" title="Fixado no topo">📌</span> : <span className="postit-tape" />}

      {selecting && (
        <span className={`postit-selectbox ${selected ? 'on' : ''}`} aria-hidden>
          {selected ? '✓' : ''}
        </span>
      )}

      {!selecting && (
        <div className={`postit-actions ${menuOpen ? 'open' : ''}`}>
          <button type="button" className="hover-only" onClick={() => onEdit(note)} aria-label="Editar" title="Editar">
            <Icon name="edit" size={15} />
          </button>
          <button
            type="button"
            className={`hover-only ${note.pinned ? 'active' : ''}`}
            onClick={() => onPin(note)}
            aria-label={note.pinned ? 'Desafixar' : 'Fixar no topo'}
            title={note.pinned ? 'Desafixar' : 'Fixar no topo'}
          >
            <Icon name="pin" size={15} />
          </button>
          <div className="postit-menu" ref={menuRef}>
            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-label="Mais ações" aria-expanded={menuOpen} title="Mais ações">
              <Icon name="more" size={16} />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  className="postit-menu-list"
                  initial={{ opacity: 0, y: -6, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                >
                  {[
                    // no toque não há "passar o mouse": editar e fixar moram aqui
                    ['edit', 'Editar', () => onEdit(note), 'touch-only'],
                    ['pin', note.pinned ? 'Desafixar' : 'Fixar no topo', () => onPin(note), 'touch-only'],
                    ['copy', 'Duplicar', () => onDuplicate(note)],
                    ['folder', 'Mover para pasta…', () => onSelect(note.id)],
                    ...(note.eventDate
                      ? [['calendar', 'Google Agenda', () => window.open(googleCalendarUrl(note), '_blank', 'noopener,noreferrer')]]
                      : []),
                    ['checkSquare', 'Selecionar', () => onSelect(note.id)],
                    ['archive', 'Arquivar', () => onArchive(note)],
                    ['trash', 'Excluir', () => onDelete(note), 'danger'],
                  ].map(([icon, label, fn, cls]) => (
                    <button
                      key={label}
                      type="button"
                      className={cls}
                      onClick={() => {
                        setMenuOpen(false);
                        fn();
                      }}
                    >
                      <Icon name={icon} size={16} /> {label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      <h3 className="postit-title">{note.title}</h3>
      {note.hasImage && <NoteImage note={note} />}
      {note.content && (
        <p className="postit-content">
          <Linked text={note.content} />
        </p>
      )}

      {total > 0 && (
        <div className="postit-checklist">
          <div className="check-progress" title={`${done} de ${total} feitos`}>
            <motion.span
              className={done === total ? 'complete' : ''}
              initial={false}
              animate={{ width: `${(done / total) * 100}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
            />
            <em>
              {done}/{total}
            </em>
          </div>
          <ul>
            {note.checklist.slice(0, grid ? 4 : 8).map((item) => (
              <li key={item.id} className={item.done ? 'done' : ''}>
                <label>
                  <input type="checkbox" checked={item.done} onChange={(e) => onToggleCheck(note, item.id, e.target.checked)} />
                  <motion.span
                    className="check-box"
                    animate={item.done ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                    transition={{ duration: 0.25 }}
                  >
                    {item.done ? '✓' : ''}
                  </motion.span>
                  <span className="check-text">{item.text}</span>
                </label>
              </li>
            ))}
            {total > (grid ? 4 : 8) && <li className="more">+{total - (grid ? 4 : 8)} itens</li>}
          </ul>
        </div>
      )}

      {note.tags.length > 0 && (
        <div className="postit-tags">
          {note.tags.map((t) => (
            <button key={t} type="button" style={{ background: tagColor(t) }} onClick={() => onTagClick(t)} title={`Filtrar por #${t}`}>
              #{t}
            </button>
          ))}
        </div>
      )}

      {note.eventDate && (
        <div className="postit-event">
          <span className="postit-event-date">
            {eventIcon(note.eventType)} {formatEventDate(note)}
            {note.repeat && note.repeat !== 'none' && ` • 🔁 ${repeatLabel(note)}`}
            {note.remindBefore > 0 && ' • 🔔'}
          </span>
          <motion.span
            className={`postit-badge ${note.isToday ? 'today' : ''} ${note.daysUntil == null ? 'past' : ''}`}
            animate={note.isToday ? { scale: calm ? [1, 1.05, 1] : [1, 1.15, 1] } : undefined}
            transition={note.isToday ? { repeat: Infinity, duration: calm ? 3 : 1.2 } : undefined}
          >
            {countdown}
          </motion.span>
        </div>
      )}

      {!grid && !selecting && (
        <span
          className="resize-handle"
          onPointerDown={resizeDown}
          onPointerMove={resizeMove}
          onPointerUp={resizeUp}
          onPointerCancel={resizeUp}
          title="Arraste para mudar o tamanho"
          aria-hidden
        />
      )}
    </motion.div>
  );
}
