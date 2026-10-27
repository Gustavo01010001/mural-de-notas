'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

export const FOLDER_ICONS = ['📁', '💼', '📚', '💡', '✈️', '🍳', '🏠', '❤️', '🎯', '🎮', '🎵', '🛒', '💰', '🏋️', '🧠', '⭐'];

// Formulário para criar ou renomear uma pasta
function FolderEditor({ initial, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '📁');
  const [saving, setSaving] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onSubmit({ name, icon });
    setSaving(false);
    if (ok) onCancel();
  }

  return (
    <motion.form
      className="folder-editor"
      onSubmit={submit}
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      onKeyDown={(e) => e.key === 'Escape' && (e.stopPropagation(), onCancel())}
    >
      <div className="folder-editor-row">
        <span className="folder-editor-icon">{icon}</span>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="Nome da pasta (ex: Trabalho, Viagem...)"
        />
      </div>
      <div className="icon-grid" role="radiogroup" aria-label="Ícone da pasta">
        {FOLDER_ICONS.map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={icon === i}
            className={icon === i ? 'selected' : ''}
            onClick={() => setIcon(i)}
          >
            {i}
          </button>
        ))}
      </div>
      <div className="folder-editor-actions">
        <button type="button" className="btn-text" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn-small" disabled={!name.trim() || saving}>
          {saving ? '...' : submitLabel}
        </button>
      </div>
    </motion.form>
  );
}

function FolderRow({ folder, active, onSelect, onRename, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  if (editing) {
    return (
      <FolderEditor
        initial={folder}
        submitLabel="Salvar"
        onSubmit={(data) => onRename(folder.id, data)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <motion.div layout className={`folder-row ${active ? 'active' : ''}`}>
      <button type="button" className="folder-main" onClick={() => onSelect(folder.id)}>
        <span className="folder-icon">{folder.icon}</span>
        <span className="folder-name">{folder.name}</span>
        <span className="folder-count">{folder.noteCount}</span>
      </button>
      <div className="folder-actions">
        {confirming ? (
          <button type="button" className="danger" onClick={() => onDelete(folder.id)} title="Os post-its voltam para o Mural geral">
            Apagar?
          </button>
        ) : (
          <>
            <button type="button" onClick={() => setEditing(true)} aria-label={`Renomear ${folder.name}`}>
              ✏️
            </button>
            <button type="button" onClick={() => setConfirming(true)} aria-label={`Apagar ${folder.name}`}>
              🗑️
            </button>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default function FolderSwitcher({ folders, rootCount, current, onSelect, onCreate, onRename, onDelete }) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef(null);

  const currentFolder = folders.find((f) => f.id === current);
  const label = currentFolder ? currentFolder.name : 'Mural geral';
  const icon = currentFolder ? currentFolder.icon : '📌';
  const count = currentFolder ? currentFolder.noteCount : rootCount;

  useEffect(() => {
    if (!open) {
      setCreating(false);
      return;
    }
    const onDown = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const select = (id) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className="folder-switcher" ref={ref}>
      <motion.button
        type="button"
        className={`folder-trigger ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.97 }}
        aria-expanded={open}
        aria-label="Trocar de pasta"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={current ?? 'root'}
            className="folder-trigger-label"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
          >
            <span className="folder-icon">{icon}</span>
            <span className="folder-name">{label}</span>
          </motion.span>
        </AnimatePresence>
        <span className="folder-count">{count}</span>
        <motion.span className="chevron" animate={{ rotate: open ? 180 : 0 }}>
          ▾
        </motion.span>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="folder-panel"
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          >
            <p className="folder-panel-title">Pastas</p>
            <div className="folder-list">
              <div className={`folder-row ${current === null ? 'active' : ''}`}>
                <button type="button" className="folder-main" onClick={() => select(null)}>
                  <span className="folder-icon">📌</span>
                  <span className="folder-name">Mural geral</span>
                  <span className="folder-count">{rootCount}</span>
                </button>
              </div>
              {folders.map((f) => (
                <FolderRow
                  key={f.id}
                  folder={f}
                  active={f.id === current}
                  onSelect={select}
                  onRename={onRename}
                  onDelete={onDelete}
                />
              ))}
              {folders.length === 0 && (
                <p className="folder-empty">Separe seus post-its por assunto: crie pastas como “Trabalho”, “Faculdade”, “Viagem”...</p>
              )}
            </div>

            <AnimatePresence initial={false} mode="wait">
              {creating ? (
                <FolderEditor
                  key="new"
                  submitLabel="Criar pasta"
                  onSubmit={async (data) => {
                    const folder = await onCreate(data);
                    if (folder) select(folder.id);
                    return Boolean(folder);
                  }}
                  onCancel={() => setCreating(false)}
                />
              ) : (
                <motion.button
                  key="add"
                  type="button"
                  className="folder-add"
                  onClick={() => setCreating(true)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  ＋ Nova pasta
                </motion.button>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
