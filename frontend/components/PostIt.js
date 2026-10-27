'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { countdownLabel, eventIcon, formatEventDate } from '@/lib/format';

// grid = modo "grade" do celular: o post-it entra no fluxo da página (sem arrastar),
// mas mantém as animações de entrada, toque e o "respirar"
export default function PostIt({ note, calm = false, found = false, grid = false, index = 0, onMove, onEdit, onDelete, onFocus }) {
  const [pos, setPos] = useState({ x: note.x, y: note.y });
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const drag = useRef(null);

  // Atualiza posição se o back devolver outra (mas não no meio do arrasto)
  useEffect(() => {
    if (!drag.current) setPos({ x: note.x, y: note.y });
  }, [note.x, note.y]);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 2500);
    return () => clearTimeout(t);
  }, [confirming]);

  function handleDown(e) {
    if (e.button !== 0 || e.target.closest('button')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y, moved: false };
    setDragging(true);
    onFocus(note.id);
  }

  function handleMove(e) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setPos({ x: Math.max(0, d.ox + dx), y: Math.max(0, d.oy + dy) });
  }

  function handleUp(e) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d?.moved) {
      onMove(note.id, {
        x: Math.max(0, d.ox + e.clientX - d.sx),
        y: Math.max(0, d.oy + e.clientY - d.sy),
      });
    }
  }

  const countdown = countdownLabel(note);
  const className = `postit postit-${note.color} ${grid ? 'in-grid' : ''} ${dragging ? 'is-dragging' : ''} ${
    note.isToday ? 'is-today' : ''
  } ${found ? 'is-found' : ''}`;
  const floatDelay = `${-(note.id % 7) * 0.9}s`; // cada post-it flutua num ritmo diferente

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
        whileTap: { scale: 0.97, rotate: 0 },
        transition: { type: 'spring', stiffness: 300, damping: 24 },
        onDoubleClick: () => onEdit(note),
      }
    : {
        style: { left: pos.x, top: pos.y, zIndex: dragging ? 9999 : note.z, '--float-delay': floatDelay },
        initial: { opacity: 0, scale: 0.3, y: -140, rotate: note.rotation - 30 },
        animate: { opacity: 1, scale: dragging ? 1.08 : 1, y: 0, rotate: dragging ? 0 : note.rotation },
        exit: { opacity: 0, scale: 0.1, rotate: note.rotation + 200, filter: 'blur(4px)', transition: { duration: 0.45 } },
        whileHover: dragging ? undefined : { scale: 1.04, rotate: 0, y: -6 },
        transition: { type: 'spring', stiffness: 260, damping: 18 },
        onPointerDown: handleDown,
        onPointerMove: handleMove,
        onPointerUp: handleUp,
        onPointerCancel: handleUp,
        onDoubleClick: () => onEdit(note),
        title: 'Arraste para mover • Duplo clique para editar',
      };

  return (
    <motion.div className={className} data-note-id={note.id} {...motionProps}>
      <span className="postit-tape" />
      <div className="postit-actions">
        <button type="button" onClick={() => onEdit(note)} aria-label="Editar">
          ✏️
        </button>
        <button
          type="button"
          className={confirming ? 'danger' : ''}
          onClick={() => (confirming ? onDelete(note.id) : setConfirming(true))}
          aria-label="Excluir"
        >
          {confirming ? 'Certeza?' : '🗑️'}
        </button>
      </div>

      <h3 className="postit-title">{note.title}</h3>
      {note.content && <p className="postit-content">{note.content}</p>}

      {note.eventDate && (
        <div className="postit-event">
          <span className="postit-event-date">
            {eventIcon(note.eventType)} {formatEventDate(note)}
            {note.repeatYearly && ' • todo ano'}
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
    </motion.div>
  );
}
