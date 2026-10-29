'use client';

import { AnimatePresence, motion } from 'framer-motion';

const initials = (name = '') =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

// Cursores das outras pessoas (desenhados dentro do mural, então acompanham zoom e rolagem)
export function LiveCursors({ cursors }) {
  return (
    <AnimatePresence>
      {Object.values(cursors).map((c) => (
        <motion.div
          key={c.userId}
          className="live-cursor"
          initial={{ opacity: 0, scale: 0.6, x: c.x, y: c.y }}
          animate={{ opacity: 1, scale: 1, x: c.x, y: c.y }}
          exit={{ opacity: 0, scale: 0.6 }}
          transition={{ type: 'spring', stiffness: 500, damping: 40, mass: 0.6 }}
          style={{ '--c': c.color }}
          aria-hidden
        >
          <svg width="22" height="22" viewBox="0 0 24 24">
            <path d="M3 2l7.5 19 2.6-7.4L21 11 3 2z" fill="var(--c)" stroke="#fff" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <span className="live-cursor-name">{c.name}</span>
        </motion.div>
      ))}
    </AnimatePresence>
  );
}

// Bolinhas de quem está na pasta agora (no topo)
export function PresenceBar({ presence, meId, connected, onOpen }) {
  const others = presence.filter((p) => p.id !== meId);
  return (
    <motion.button
      type="button"
      className={`presence-bar ${connected ? 'on' : ''}`}
      onClick={onOpen}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      title={others.length ? `Agora na pasta: ${others.map((p) => p.name).join(', ')}` : 'Pasta compartilhada — ninguém mais aqui agora'}
    >
      <span className="presence-dot" />
      <AnimatePresence initial={false}>
        {others.slice(0, 3).map((p) => (
          <motion.span
            key={p.id}
            className="avatar mini"
            style={{ background: p.color }}
            initial={{ scale: 0, width: 0 }}
            animate={{ scale: 1, width: 28 }}
            exit={{ scale: 0, width: 0 }}
          >
            {initials(p.name)}
          </motion.span>
        ))}
      </AnimatePresence>
      {others.length > 3 && <span className="avatar mini more">+{others.length - 3}</span>}
      {others.length === 0 && <span className="presence-label">👥</span>}
    </motion.button>
  );
}

// Faixa com as pastas que aparece ao arrastar um post-it: solte em cima para mover
export function FolderDropDock({ targets, hoverId }) {
  return (
    <motion.div
      className="drop-dock"
      initial={{ y: -40, opacity: 0, x: '-50%' }}
      animate={{ y: 0, opacity: 1, x: '-50%' }}
      exit={{ y: -40, opacity: 0, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <span className="drop-dock-hint">Solte numa pasta para mover:</span>
      {targets.map((t) => (
        <motion.span
          key={t.key}
          data-drop-folder={t.key}
          className={`drop-target folder-tint-${t.color ?? 'none'} ${hoverId === t.key ? 'hover' : ''}`}
          animate={hoverId === t.key ? { scale: 1.12, y: 4 } : { scale: 1, y: 0 }}
          style={{ paddingLeft: 10 + (t.depth - 1) * 6 }}
        >
          {t.depth > 1 && <small>└</small>}
          {t.icon} {t.name}
        </motion.span>
      ))}
    </motion.div>
  );
}
