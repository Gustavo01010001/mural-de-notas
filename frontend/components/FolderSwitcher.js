'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'framer-motion';
import { COLORS } from '@/lib/format';
import { childrenOf, MAX_DEPTH, pathOf, validParents } from '@/lib/folderTree';
import Icon from './Icon';

export const FOLDER_ICONS = ['📁', '💼', '📚', '🎓', '📝', '💡', '✈️', '🍳', '🏠', '❤️', '🎯', '🎮', '🎵', '🛒', '💰', '🏋️', '🧠', '⭐'];

// Formulário para criar ou editar uma pasta: nome, ícone, cor e "dentro de qual pasta"
function FolderEditor({ initial, folders, fixedParentId, submitLabel, onSubmit, onCancel }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [icon, setIcon] = useState(initial?.icon ?? '📁');
  const [color, setColor] = useState(initial?.color ?? 'yellow');
  const [parentId, setParentId] = useState(fixedParentId ?? initial?.parentId ?? null);
  const [saving, setSaving] = useState(false);
  const parents = useMemo(() => validParents(folders, initial?.id ?? null), [folders, initial]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    const ok = await onSubmit({ name, icon, color, parentId });
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
        <span className={`folder-editor-icon folder-color-${color}`}>{icon}</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="Nome da pasta (ex: Trabalho, Viagem...)" />
      </div>
      <div className="icon-grid" role="radiogroup" aria-label="Ícone da pasta">
        {FOLDER_ICONS.map((i) => (
          <button key={i} type="button" role="radio" aria-checked={icon === i} className={icon === i ? 'selected' : ''} onClick={() => setIcon(i)}>
            {i}
          </button>
        ))}
      </div>
      <div className="folder-editor-colors" role="radiogroup" aria-label="Cor da pasta">
        {COLORS.map((c) => (
          <button
            key={c.id}
            type="button"
            role="radio"
            aria-checked={color === c.id}
            aria-label={c.label}
            className={`color-dot small dot-${c.id} ${color === c.id ? 'selected light' : ''}`}
            onClick={() => setColor(c.id)}
          />
        ))}
      </div>
      {fixedParentId === undefined && (
        <label className="folder-editor-parent">
          <span>Dentro de</span>
          <select value={parentId ?? ''} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">— nenhuma (pasta principal)</option>
            {parents.map((f) => (
              <option key={f.id} value={f.id}>
                {'  '.repeat(f.depth - 1)}
                {f.depth > 1 ? '└ ' : ''}
                {f.icon} {f.name}
              </option>
            ))}
          </select>
        </label>
      )}
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

function FolderItem({ folder, depth, ctx }) {
  const controls = useDragControls();
  const [mode, setMode] = useState(null); // 'edit' | 'sub' | null
  const [confirming, setConfirming] = useState(false);
  const kids = childrenOf(ctx.folders, folder.id);
  const open = ctx.expanded.has(folder.id);

  useEffect(() => {
    if (!confirming) return;
    const t = setTimeout(() => setConfirming(false), 3000);
    return () => clearTimeout(t);
  }, [confirming]);

  return (
    <Reorder.Item
      value={folder.id}
      dragListener={false}
      dragControls={controls}
      className="folder-item"
      onDragEnd={() => ctx.commitOrder(folder.parentId ?? null)}
      whileDrag={{ scale: 1.02, boxShadow: '0 10px 30px rgba(0,0,0,0.5)', zIndex: 5 }}
    >
      {mode === 'edit' ? (
        <FolderEditor initial={folder} folders={ctx.folders} submitLabel="Salvar" onSubmit={(d) => ctx.onRename(folder.id, d)} onCancel={() => setMode(null)} />
      ) : (
        <div className={`folder-row depth-${depth} ${folder.id === ctx.current ? 'active' : ''}`} style={{ '--depth': depth - 1 }}>
          <span className="folder-handle" onPointerDown={(e) => controls.start(e)} title="Arraste para mudar a ordem" aria-hidden>
            ⠿
          </span>
          {kids.length > 0 ? (
            <button type="button" className={`folder-chevron ${open ? 'open' : ''}`} onClick={() => ctx.toggle(folder.id)} aria-label={open ? 'Recolher' : 'Expandir'}>
              ▸
            </button>
          ) : (
            <span className="folder-chevron placeholder" />
          )}
          <button type="button" className="folder-main" onClick={() => ctx.select(folder.id)}>
            <span className={`folder-swatch folder-color-${folder.color}`} />
            <span className="folder-icon">{folder.icon}</span>
            <span className="folder-name">{folder.name}</span>
            {folder.memberCount > 0 && (
              <span className="folder-shared-badge" title={`Compartilhada com ${folder.memberCount} pessoa(s)`}>
                <Icon name="users" size={13} />
                {folder.memberCount}
              </span>
            )}
            <span className="folder-count">{folder.noteCount}</span>
          </button>
          <div className="folder-actions">
            {confirming ? (
              <button type="button" className="danger" onClick={() => ctx.onDelete(folder.id)} title="Os post-its voltam para o Mural geral">
                Apagar?
              </button>
            ) : (
              <>
                {depth < MAX_DEPTH && (
                  <button type="button" onClick={() => (ctx.expand(folder.id), setMode('sub'))} aria-label={`Nova subpasta em ${folder.name}`} title="Nova subpasta">
                    <Icon name="plus" size={15} />
                  </button>
                )}
                <button type="button" onClick={() => ctx.onShare(folder)} aria-label={`Compartilhar ${folder.name}`} title="Compartilhar">
                  <Icon name="users" size={15} />
                </button>
                <button type="button" onClick={() => setMode('edit')} aria-label={`Editar ${folder.name}`} title="Editar">
                  <Icon name="edit" size={15} />
                </button>
                <button type="button" onClick={() => setConfirming(true)} aria-label={`Apagar ${folder.name}`} title="Apagar">
                  <Icon name="trash" size={15} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <AnimatePresence initial={false}>
        {mode === 'sub' && (
          <div className="folder-sub-editor" style={{ '--depth': depth }}>
            <FolderEditor
              folders={ctx.folders}
              fixedParentId={folder.id}
              submitLabel={`Criar em "${folder.name}"`}
              onSubmit={async (d) => {
                const created = await ctx.onCreate({ ...d, parentId: folder.id });
                if (created) ctx.select(created.id);
                return Boolean(created);
              }}
              onCancel={() => setMode(null)}
            />
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {open && kids.length > 0 && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
            <FolderLevel parentId={folder.id} depth={depth + 1} ctx={ctx} />
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

// Um nível da árvore (pastas irmãs), reordenável arrastando a alça ⠿
function FolderLevel({ parentId, depth, ctx }) {
  const ids = ctx.orderFor(parentId);
  const byId = new Map(ctx.folders.map((f) => [f.id, f]));
  return (
    <Reorder.Group axis="y" values={ids} onReorder={(next) => ctx.setOrder(parentId, next)} className="folder-level">
      {ids.map((id) => byId.get(id) && <FolderItem key={id} folder={byId.get(id)} depth={depth} ctx={ctx} />)}
    </Reorder.Group>
  );
}

export default function FolderSwitcher({
  folders,
  shared = [],
  rootCount,
  archivedCount = 0,
  trashCount = 0,
  current,
  onSelect,
  onCreate,
  onRename,
  onDelete,
  onReorder,
  onShare,
  onOpenSpecial,
}) {
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [expanded, setExpanded] = useState(() => new Set());
  const [order, setOrderState] = useState({}); // parentId -> ids (enquanto arrasta)
  const ref = useRef(null);

  const sharedFolder = shared.find((f) => f.id === current);
  const path = current && !sharedFolder ? pathOf(folders, current) : [];
  const currentFolder = sharedFolder ?? path[path.length - 1];
  const icon = currentFolder ? currentFolder.icon : '📌';
  const count = currentFolder ? currentFolder.noteCount : rootCount;

  // pasta aberta: deixa os "pais" dela expandidos
  useEffect(() => {
    if (!path.length) return;
    setExpanded((s) => new Set([...s, ...path.slice(0, -1).map((f) => f.id)]));
  }, [current, folders.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setOrderState({}), [folders]);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      return;
    }
    const onDown = (e) => !ref.current?.contains(e.target) && !e.target.closest?.('.share-modal, .modal-backdrop') && setOpen(false);
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

  const ctx = {
    folders,
    current,
    expanded,
    select,
    onCreate,
    onRename,
    onDelete,
    // abre a janela de compartilhar e fecha a lista de pastas
    onShare: (folder) => {
      setOpen(false);
      onShare(folder);
    },
    toggle: (id) =>
      setExpanded((s) => {
        const n = new Set(s);
        n.has(id) ? n.delete(id) : n.add(id);
        return n;
      }),
    expand: (id) => setExpanded((s) => new Set([...s, id])),
    orderFor: (parentId) => order[parentId ?? 'root'] ?? childrenOf(folders, parentId).map((f) => f.id),
    setOrder: (parentId, ids) => setOrderState((o) => ({ ...o, [parentId ?? 'root']: ids })),
    commitOrder: (parentId) => {
      const ids = order[parentId ?? 'root'];
      const original = childrenOf(folders, parentId).map((f) => f.id);
      if (ids && ids.join() !== original.join()) onReorder(parentId, ids);
    },
  };

  return (
    <div className="folder-switcher" ref={ref}>
      <motion.button
        type="button"
        className={`folder-trigger ${open ? 'open' : ''} ${currentFolder ? `folder-tint-${currentFolder.color}` : ''}`}
        onClick={() => setOpen((o) => !o)}
        whileTap={{ scale: 0.97 }}
        aria-expanded={open}
        aria-label="Trocar de pasta"
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={current ?? 'root'} className="folder-trigger-label" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -12, opacity: 0 }}>
            <span className="folder-icon">{sharedFolder ? '👥' : icon}</span>
            <span className="folder-name">
              {path.length > 1 && <span className="folder-crumbs">{path.slice(0, -1).map((f) => f.name).join(' › ')} › </span>}
              {currentFolder ? currentFolder.name : 'Mural geral'}
            </span>
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
                <span className="folder-handle placeholder" />
                <span className="folder-chevron placeholder" />
                <button type="button" className="folder-main" onClick={() => select(null)}>
                  <span className="folder-icon">📌</span>
                  <span className="folder-name">Mural geral</span>
                  <span className="folder-count">{rootCount}</span>
                </button>
              </div>
              <FolderLevel parentId={null} depth={1} ctx={ctx} />
              {folders.length === 0 && (
                <p className="folder-empty">Separe seus post-its por assunto: crie pastas como “Faculdade” e, dentro dela, “Cálculo” e “TCC”.</p>
              )}
            </div>

            <AnimatePresence initial={false} mode="wait">
              {creating ? (
                <FolderEditor
                  key="new"
                  folders={folders}
                  submitLabel="Criar pasta"
                  onSubmit={async (data) => {
                    const folder = await onCreate(data);
                    if (folder) select(folder.id);
                    return Boolean(folder);
                  }}
                  onCancel={() => setCreating(false)}
                />
              ) : (
                <motion.button key="add" type="button" className="folder-add" onClick={() => setCreating(true)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <Icon name="plus" size={16} /> Nova pasta
                </motion.button>
              )}
            </AnimatePresence>

            {shared.length > 0 && (
              <>
                <p className="folder-panel-title">Compartilhadas comigo</p>
                <div className="folder-list">
                  {shared.map((f) => (
                    <div key={f.id} className={`folder-row ${f.id === current ? 'active' : ''}`}>
                      <span className="folder-handle placeholder" />
                      <span className="folder-chevron placeholder" />
                      <button type="button" className="folder-main" onClick={() => select(f.id)}>
                        <span className={`folder-swatch folder-color-${f.color}`} />
                        <span className="folder-icon">{f.icon}</span>
                        <span className="folder-name">
                          {f.name}
                          <small className="folder-owner">de {f.ownerName}</small>
                        </span>
                        <span className="folder-count">{f.noteCount}</span>
                      </button>
                      <div className="folder-actions">
                        <button type="button" onClick={() => ctx.onShare(f)} aria-label={`Pessoas em ${f.name}`} title="Quem participa">
                          <Icon name="users" size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="folder-special">
              <button type="button" onClick={() => (setOpen(false), onOpenSpecial('archive'))}>
                <Icon name="archive" size={16} /> Arquivados <span className="folder-count">{archivedCount}</span>
              </button>
              <button type="button" onClick={() => (setOpen(false), onOpenSpecial('trash'))}>
                <Icon name="trash" size={16} /> Lixeira <span className="folder-count">{trashCount}</span>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
