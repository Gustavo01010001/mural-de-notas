'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { COLORS, EVENT_TYPES, REMIND_OPTIONS, REPEAT_OPTIONS, repeatLabel } from '@/lib/format';
import { compressImage, parseTagInput, tagColor } from '@/lib/noteHelpers';
import { noteImageUrl } from '@/lib/api';

const EMPTY = {
  title: '',
  content: '',
  color: 'yellow',
  checklist: [],
  tags: [],
  hasDate: false,
  eventDate: '',
  eventTime: '',
  eventType: 'birthday',
  remindBefore: 0,
  repeat: 'yearly',
};

const newItemId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function fromNote(note, defaultColor, currentFolder) {
  if (!note) return { ...EMPTY, color: defaultColor ?? EMPTY.color, folderId: currentFolder ?? null };
  return {
    folderId: note.folderId ?? null,
    title: note.title,
    content: note.content,
    color: note.color,
    checklist: note.checklist ?? [],
    tags: note.tags ?? [],
    hasDate: Boolean(note.eventDate),
    eventDate: note.eventDate ?? '',
    eventTime: note.eventTime ?? '',
    eventType: note.eventType ?? 'birthday',
    remindBefore: note.remindBefore ?? 0,
    repeat: note.eventDate ? note.repeat ?? 'none' : 'yearly',
  };
}

export default function NoteModal({ open, note, defaultColor, folders = [], currentFolder = null, sharedLocked = false, onClose, onSave }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [newItem, setNewItem] = useState('');
  const [tagInput, setTagInput] = useState('');
  // foto: "keep" = não mexe; { dataUrl } = nova; "remove" = tirar
  const [image, setImage] = useState('keep');
  const [preview, setPreview] = useState(null);
  const [imageError, setImageError] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setForm(fromNote(note, defaultColor, currentFolder));
    setNewItem('');
    setTagInput('');
    setImage('keep');
    setImageError('');
    setPreview(null);
    if (note?.hasImage) noteImageUrl(note.id, note.updatedAt).then(setPreview).catch(() => {});
  }, [open, note, defaultColor, currentFolder]);

  function addItem() {
    const text = newItem.trim();
    if (!text) return;
    setForm((f) => ({ ...f, checklist: [...f.checklist, { id: newItemId(), text, done: false }] }));
    setNewItem('');
  }

  const updateItem = (id, patch) =>
    setForm((f) => ({ ...f, checklist: f.checklist.map((i) => (i.id === id ? { ...i, ...patch } : i)) }));
  const removeItem = (id) => setForm((f) => ({ ...f, checklist: f.checklist.filter((i) => i.id !== id) }));

  function addTags(value = tagInput) {
    const tags = parseTagInput(value);
    if (!tags.length) return;
    setForm((f) => ({ ...f, tags: [...new Set([...f.tags, ...tags])].slice(0, 6) }));
    setTagInput('');
  }

  async function pickImage(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImageError('');
    try {
      const dataUrl = await compressImage(file);
      setImage({ dataUrl });
      setPreview(dataUrl);
    } catch (err) {
      setImageError(err.message);
    }
  }

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
    // etiqueta digitada e não confirmada com Enter também entra
    const pendingTags = parseTagInput(tagInput);
    const pendingItem = newItem.trim();
    const ok = await onSave(
      {
        folderId: form.folderId,
        title: form.title,
        content: form.content,
        color: form.color,
        checklist: pendingItem ? [...form.checklist, { id: newItemId(), text: pendingItem, done: false }] : form.checklist,
        tags: [...new Set([...form.tags, ...pendingTags])],
        eventDate: form.hasDate ? form.eventDate : null,
        eventType: form.hasDate ? form.eventType : null,
        eventTime: form.hasDate && form.eventTime ? form.eventTime : null,
        // sem horário, aviso só em dias (1 dia, 2 dias, 1 semana)
        remindBefore: form.hasDate && (form.eventTime || form.remindBefore >= 1440) ? form.remindBefore : 0,
        repeat: form.hasDate ? (form.eventType === 'birthday' ? 'yearly' : form.repeat) : 'none',
      },
      image,
    );
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

            {/* Checklist */}
            <div className="modal-section">
              <span className="modal-label">☑️ Checklist</span>
              <AnimatePresence initial={false}>
                {form.checklist.map((item) => (
                  <motion.div
                    key={item.id}
                    className={`check-edit ${item.done ? 'done' : ''}`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                  >
                    <input type="checkbox" checked={item.done} onChange={(e) => updateItem(item.id, { done: e.target.checked })} aria-label="Feito" />
                    <input
                      className="check-edit-text"
                      value={item.text}
                      maxLength={120}
                      onChange={(e) => updateItem(item.id, { text: e.target.value })}
                    />
                    <button type="button" className="icon-mini" onClick={() => removeItem(item.id)} aria-label="Remover item">
                      ✕
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              {form.checklist.length < 30 && (
                <div className="check-add">
                  <input
                    placeholder="+ Adicionar item (Enter)"
                    value={newItem}
                    maxLength={120}
                    onChange={(e) => setNewItem(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addItem();
                      }
                    }}
                  />
                  <button type="button" className="icon-mini" onClick={addItem} aria-label="Adicionar item">
                    ＋
                  </button>
                </div>
              )}
            </div>

            {/* Etiquetas */}
            <div className="modal-section">
              <span className="modal-label">🏷️ Etiquetas</span>
              <div className="tag-edit">
                {form.tags.map((t) => (
                  <span key={t} className="tag-chip" style={{ background: tagColor(t) }}>
                    #{t}
                    <button type="button" onClick={() => setForm((f) => ({ ...f, tags: f.tags.filter((x) => x !== t) }))} aria-label={`Tirar #${t}`}>
                      ✕
                    </button>
                  </span>
                ))}
                {form.tags.length < 6 && (
                  <input
                    placeholder={form.tags.length ? '+ etiqueta' : 'ex: urgente, ideia (Enter)'}
                    value={tagInput}
                    maxLength={40}
                    onChange={(e) => {
                      // vírgula ou espaço já confirmam a etiqueta
                      if (/[,\s]$/.test(e.target.value)) addTags(e.target.value);
                      else setTagInput(e.target.value);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addTags();
                      } else if (e.key === 'Backspace' && !tagInput && form.tags.length) {
                        setForm((f) => ({ ...f, tags: f.tags.slice(0, -1) }));
                      }
                    }}
                  />
                )}
              </div>
            </div>

            {/* Foto */}
            <div className="modal-section">
              <span className="modal-label">📷 Foto</span>
              {preview && image !== 'remove' ? (
                <div className="image-preview">
                  <img src={preview} alt="Prévia da foto" />
                  <div>
                    <button type="button" className="btn-ghost small" onClick={() => fileRef.current?.click()}>
                      Trocar
                    </button>
                    <button
                      type="button"
                      className="btn-ghost small"
                      onClick={() => {
                        setImage(note?.hasImage ? 'remove' : 'keep');
                        setPreview(null);
                      }}
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ) : (
                <button type="button" className="image-pick" onClick={() => fileRef.current?.click()}>
                  + Adicionar foto (ex.: foto da receita)
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickImage} />
              {imageError && <small className="modal-error">{imageError}</small>}
            </div>

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
                  disabled={sharedLocked}
                  title={sharedLocked ? 'Post-its de uma pasta compartilhada ficam nela' : undefined}
                  onChange={(e) => setForm((f) => ({ ...f, folderId: e.target.value ? Number(e.target.value) : null }))}
                >
                  {!sharedLocked && <option value="">📌 Mural geral</option>}
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {'  '.repeat((f.depth ?? 1) - 1)}
                      {(f.depth ?? 1) > 1 ? '└ ' : ''}
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
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            eventType: t.id,
                            // saiu de "aniversário": volta para "não repetir"
                            repeat: t.id === 'birthday' ? 'yearly' : f.eventType === 'birthday' ? 'none' : f.repeat,
                          }))
                        }
                      >
                        {t.icon} {t.label}
                      </button>
                    ))}
                  </div>
                  <div className="date-row">
                    <label className="date-field">
                      <span>Dia</span>
                      <input type="date" value={form.eventDate} onChange={set('eventDate')} />
                    </label>
                    <label className="date-field">
                      <span>Horário (opcional)</span>
                      <span className="time-wrap">
                        <input type="time" value={form.eventTime} onChange={set('eventTime')} />
                        {form.eventTime && (
                          <button type="button" className="icon-mini" onClick={() => setForm((f) => ({ ...f, eventTime: '' }))} aria-label="Tirar horário">
                            ✕
                          </button>
                        )}
                      </span>
                    </label>
                  </div>
                  <div className="date-row">
                    <label className="date-field">
                      <span>🔔 Avisar</span>
                      <select value={form.remindBefore} onChange={(e) => setForm((f) => ({ ...f, remindBefore: Number(e.target.value) }))}>
                        {REMIND_OPTIONS.filter((o) => form.eventTime || o.id === 0 || o.id >= 1440).map((o) => (
                          <option key={o.id} value={o.id}>
                            {o.id === 0 ? (form.eventTime ? 'Na hora' : 'No dia') : o.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="date-field">
                      <span>🔁 Repetir</span>
                      {form.eventType === 'birthday' ? (
                        <select value="yearly" disabled>
                          <option value="yearly">Todo ano 🎂</option>
                        </select>
                      ) : (
                        <select value={form.repeat} onChange={set('repeat')}>
                          {REPEAT_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.id === 'weekly' && form.eventDate ? repeatLabel({ repeat: 'weekly', eventDate: form.eventDate }).replace(/^./, (c) => c.toUpperCase()) : o.id === 'monthly' && form.eventDate ? `Todo dia ${Number(form.eventDate.slice(8))}` : o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </label>
                  </div>
                  {form.eventType === 'birthday' && <small>🎂 Aniversários são lembrados todo ano automaticamente.</small>}
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
