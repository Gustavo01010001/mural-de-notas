'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS, EVENT_TYPES } from '@/lib/format';

const EMPTY = {
  title: '',
  content: '',
  color: 'yellow',
  hasDate: false,
  eventDate: '',
  eventType: 'birthday',
  repeatYearly: true,
};

function fromNote(note, defaultColor, currentFolder) {
  if (!note) return { ...EMPTY, color: defaultColor ?? EMPTY.color, folderId: currentFolder ?? null };
  return {
    folderId: note.folderId ?? null,
    title: note.title,
    content: note.content,
    color: note.color,
    hasDate: Boolean(note.eventDate),
    eventDate: note.eventDate ?? '',
    eventType: note.eventType ?? 'birthday',
    repeatYearly: note.eventDate ? note.repeatYearly : true,
  };
}

export default function NoteModal({ open, note, defaultColor, folders = [], currentFolder = null, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm(fromNote(note, defaultColor, currentFolder));
  }, [open, note, defaultColor, currentFolder]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const set = (field) => (e) =>
    setForm((f) => ({ ...f, [field]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    // Só repassa o que foi digitado; quem valida e salva é o back
    const ok = await onSave({
      folderId: form.folderId,
      title: form.title,
      content: form.content,
      color: form.color,
      eventDate: form.hasDate ? form.eventDate : null,
      eventType: form.hasDate ? form.eventType : null,
      repeatYearly: form.hasDate && (form.eventType === 'birthday' || form.repeatYearly),
    });
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.form
            onSubmit={handleSubmit}
            className={`note-modal postit-${form.color}`}
            initial={{ scale: 0.6, rotate: -8, y: 60, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, y: 0, opacity: 1 }}
            exit={{ scale: 0.6, rotate: 8, y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 22 }}
          >
            <span className="postit-tape" />
            <h2>{note ? 'Editar post-it' : 'Novo post-it'}</h2>

            <input
              className="note-title-input"
              placeholder="Título (ex: Aniversário da Ana)"
              value={form.title}
              onChange={set('title')}
              maxLength={80}
              autoFocus
            />
            <textarea
              placeholder="Escreva sua nota..."
              value={form.content}
              onChange={set('content')}
              maxLength={1000}
              rows={4}
            />

            <div className="color-row" role="radiogroup" aria-label="Cor">
              {COLORS.map((c) => (
                <motion.button
                  key={c.id}
                  type="button"
                  className={`color-dot dot-${c.id} ${form.color === c.id ? 'selected' : ''}`}
                  onClick={() => setForm((f) => ({ ...f, color: c.id }))}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  aria-label={c.label}
                  aria-checked={form.color === c.id}
                  role="radio"
                />
              ))}
            </div>

            {folders.length > 0 && (
              <label className="folder-select">
                <span>📁 Pasta</span>
                <select
                  value={form.folderId ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, folderId: e.target.value ? Number(e.target.value) : null }))}
                >
                  <option value="">📌 Mural geral</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.icon} {f.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="toggle">
              <input type="checkbox" checked={form.hasDate} onChange={set('hasDate')} />
              <span className="toggle-track">
                <span className="toggle-thumb" />
              </span>
              Marcar uma data importante
            </label>

            <AnimatePresence initial={false}>
              {form.hasDate && (
                <motion.div
                  className="date-fields"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                >
                  <div className="type-row">
                    {EVENT_TYPES.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`type-chip ${form.eventType === t.id ? 'selected' : ''}`}
                        onClick={() => setForm((f) => ({ ...f, eventType: t.id }))}
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <input type="date" value={form.eventDate} onChange={set('eventDate')} />
                  {form.eventType === 'birthday' ? (
                    <small>🎂 Aniversários são lembrados todo ano automaticamente.</small>
                  ) : (
                    <label className="check">
                      <input type="checkbox" checked={form.repeatYearly} onChange={set('repeatYearly')} />
                      Repetir todo ano
                    </label>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            <div className="modal-buttons">
              <button type="button" className="btn-ghost" onClick={onClose}>
                Cancelar
              </button>
              <motion.button type="submit" className="btn-dark" disabled={saving} whileTap={{ scale: 0.95 }}>
                {saving ? 'Salvando...' : note ? 'Salvar' : 'Colar no mural 📌'}
              </motion.button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
