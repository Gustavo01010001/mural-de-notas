'use client';

import { AnimatePresence, motion } from 'framer-motion';

export const ZOOM_MIN = 0.4;
export const ZOOM_MAX = 1.6;

// Ferramentas discretas do mural (canto de baixo): zoom, arrumar e selecionar
export function BoardTools({ zoom, onZoom, onArrange, arranging, onSelectMode, selecting, showFreeTools }) {
  return (
    <motion.div className="board-tools" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
      {showFreeTools && (
        <>
          <div className="zoom-control" role="group" aria-label="Zoom do mural">
            <button type="button" onClick={() => onZoom(zoom - 0.1)} disabled={zoom <= ZOOM_MIN + 0.001} aria-label="Diminuir zoom">
              −
            </button>
            <button type="button" className="zoom-value" onClick={() => onZoom(1)} title="Voltar para 100%">
              {Math.round(zoom * 100)}%
            </button>
            <button type="button" onClick={() => onZoom(zoom + 0.1)} disabled={zoom >= ZOOM_MAX - 0.001} aria-label="Aumentar zoom">
              +
            </button>
          </div>
          <button type="button" className="tool-btn" onClick={onArrange} disabled={arranging} title="Organizar os post-its em grade">
            <motion.span animate={arranging ? { rotate: 360 } : { rotate: 0 }} transition={{ duration: 0.6 }}>
              ▦
            </motion.span>
            <span className="tool-label">Arrumar</span>
          </button>
        </>
      )}
      <button type="button" className={`tool-btn ${selecting ? 'active' : ''}`} onClick={onSelectMode} title="Selecionar vários post-its">
        ☑ <span className="tool-label">{selecting ? 'Cancelar' : 'Selecionar'}</span>
      </button>
    </motion.div>
  );
}

// Barra que aparece quando há post-its selecionados
export function SelectionBar({ count, total, folders, currentFolder, onMove, onArchive, onDelete, onPin, onSelectAll, onCancel }) {
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
          <label className="sel-move">
            <span>📁 Mover</span>
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
                    {f.icon} {f.name}
                  </option>
                ))}
            </select>
          </label>
          <button type="button" className="sel-btn" onClick={onPin} disabled={!count}>
            📌 Fixar
          </button>
          <button type="button" className="sel-btn" onClick={onArchive} disabled={!count}>
            📦 Arquivar
          </button>
          <button type="button" className="sel-btn danger" onClick={onDelete} disabled={!count}>
            🗑️ Excluir
          </button>
          <button type="button" className="sel-close" onClick={onCancel} aria-label="Cancelar seleção">
            ✕
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
