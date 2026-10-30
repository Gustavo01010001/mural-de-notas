'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Icon from './Icon';

import { ZOOM_MAX, ZOOM_MIN } from '@/lib/useInfiniteBoard';

export { ZOOM_MAX, ZOOM_MIN };

function ZoomControl({ zoom, onZoom, onFit, className = '' }) {
  return (
    <div className={`zoom-control ${className}`} role="group" aria-label="Zoom do mural">
      <button type="button" onClick={() => onZoom(zoom / 1.25)} disabled={zoom <= ZOOM_MIN + 0.001} aria-label="Diminuir zoom" title="Diminuir zoom">
        <Icon name="minus" size={16} />
      </button>
      <button type="button" className="zoom-value" onClick={() => onZoom(1)} title="Voltar para 100% (tecla 0)">
        {Math.round(zoom * 100)}%
      </button>
      <button type="button" onClick={() => onZoom(zoom * 1.25)} disabled={zoom >= ZOOM_MAX - 0.001} aria-label="Aumentar zoom" title="Aumentar zoom">
        <Icon name="plus" size={16} />
      </button>
      {onFit && (
        <button type="button" className="zoom-fit" onClick={onFit} aria-label="Ajustar à tela" title="Ajustar à tela: ver todos os post-its (Shift + 1)">
          <Icon name="fit" size={16} />
        </button>
      )}
    </div>
  );
}

// Barra de baixo do mural. Pensada com IHC (projeto minimalista): à vista fica só o que se usa sempre
// (zoom no PC e o timer quando ligado); o resto vai para o menu "Mais", com nome escrito em cada opção.
// O timer entra aqui dentro (children), então nunca fica por cima dos botões.
export function BoardTools({
  zoom,
  onZoom,
  onFit,
  onArrange,
  onArrangeSubject,
  arranging,
  onSelectMode,
  selecting,
  showFreeTools,
  hasNotes,
  focusOn,
  onFocusTimer,
  showSubjects,
  onToggleSubjects,
  showMinimap,
  onToggleMinimap,
  children,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  const run = (fn) => () => {
    setOpen(false);
    fn();
  };

  const items = [
    showFreeTools && hasNotes && { icon: 'layers', label: 'Organizar por assunto', hint: 'Junta os post-its pela 1ª #etiqueta', fn: onArrangeSubject, disabled: arranging },
    showFreeTools && hasNotes && { icon: 'grid', label: arranging ? 'Arrumando…' : 'Arrumar em grade', hint: 'Organiza os post-its lado a lado', fn: onArrange, disabled: arranging },
    hasNotes && { icon: 'checkSquare', label: selecting ? 'Cancelar seleção' : 'Selecionar vários', hint: 'Mover, arquivar ou excluir de uma vez', fn: onSelectMode },
    showFreeTools && hasNotes && { icon: 'fit', label: 'Ajustar à tela', hint: 'Ver todos os post-its (Shift + 1)', fn: onFit },
    showFreeTools && hasNotes && { icon: 'tag', label: showSubjects ? 'Esconder assuntos' : 'Mostrar assuntos', hint: 'Contorna os post-its de cada #etiqueta', fn: onToggleSubjects, on: showSubjects },
    showFreeTools && hasNotes && { icon: 'map', label: showMinimap ? 'Esconder minimapa' : 'Mostrar minimapa', hint: 'Mapinha para navegar pelo mural', fn: onToggleMinimap, on: showMinimap },
    { icon: 'timer', label: focusOn ? 'Esconder timer de foco' : 'Timer de foco', hint: 'Pomodoro: foco e pausa', fn: onFocusTimer },
  ].filter(Boolean);

  return (
    <motion.div className="board-tools" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      <AnimatePresence>{children}</AnimatePresence>
      {showFreeTools && hasNotes && <ZoomControl zoom={zoom} onZoom={onZoom} onFit={onFit} className="zoom-outside" />}
      <div className="tools-menu" ref={ref}>
        <button
          type="button"
          className={`tool-btn ${open || selecting ? 'active' : ''}`}
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="menu"
          title="Mais ferramentas"
        >
          <Icon name="more" size={18} /> <span className="tool-label">Mais</span>
        </button>
        <AnimatePresence>
          {open && (
            <motion.div
              className="tools-menu-list"
              role="menu"
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.96 }}
              transition={{ duration: 0.15 }}
            >
              {showFreeTools && hasNotes && <ZoomControl zoom={zoom} onZoom={onZoom} onFit={onFit} className="zoom-inside" />}
              {items.map((it) => (
                <button key={it.icon} type="button" role={it.on === undefined ? 'menuitem' : 'menuitemcheckbox'} aria-checked={it.on} className={it.on ? 'on' : ''} onClick={run(it.fn)} disabled={it.disabled}>
                  <span className="tm-icon">
                    <Icon name={it.icon} size={18} />
                  </span>
                  <span className="tm-text">
                    {it.label}
                    <small>{it.hint}</small>
                  </span>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// Barra que aparece quando há post-its selecionados
export function SelectionBar({ count, total, folders, currentFolder, canMove = true, onMove, onArchive, onDelete, onPin, onSelectAll, onCancel }) {
  return (
    <AnimatePresence>
      {count !== null && (
        <motion.div
          className="selection-bar"
          initial={{ y: 80, opacity: 0, x: '-50%' }}
          animate={{ y: 0, opacity: 1, x: '-50%' }}
          exit={{ y: 80, opacity: 0, x: '-50%' }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <strong>
            {count} selecionado{count === 1 ? '' : 's'}
          </strong>
          <button type="button" className="sel-btn" onClick={onSelectAll} disabled={count === total}>
            Todos
          </button>
          {canMove && (
            <label className="sel-move">
              <span>
                <Icon name="folder" size={15} /> Mover
              </span>
              <select
                value=""
                disabled={!count}
                onChange={(e) => e.target.value !== '' && onMove(e.target.value === 'root' ? null : Number(e.target.value))}
              >
                <option value="">Mover para…</option>
                {currentFolder !== null && <option value="root">📌 Mural geral</option>}
                {folders
                  .filter((f) => f.id !== currentFolder)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {'  '.repeat((f.depth ?? 1) - 1)}
                      {(f.depth ?? 1) > 1 ? '└ ' : ''}
                      {f.icon} {f.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button type="button" className="sel-btn" onClick={onPin} disabled={!count}>
            <Icon name="pin" size={15} /> Fixar
          </button>
          <button type="button" className="sel-btn" onClick={onArchive} disabled={!count}>
            <Icon name="archive" size={15} /> Arquivar
          </button>
          <button type="button" className="sel-btn danger" onClick={onDelete} disabled={!count}>
            <Icon name="trash" size={15} /> Excluir
          </button>
          <button type="button" className="sel-close" onClick={onCancel} aria-label="Cancelar seleção">
            <Icon name="x" size={16} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
