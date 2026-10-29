'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';
import { daysLeftInTrash } from '@/lib/noteHelpers';
import Icon from './Icon';

const MODES = {
  trash: {
    title: 'Lixeira',
    icon: 'trash',
    empty: 'A lixeira está vazia. Post-its excluídos ficam aqui por 30 dias.',
    endpoint: '/notes/trash',
  },
  archive: {
    title: 'Arquivados',
    icon: 'archive',
    empty: 'Nenhum post-it arquivado. Arquive o que já foi resolvido para limpar o mural sem apagar.',
    endpoint: '/notes/archived',
  },
};

// Lista de post-its que saíram do mural: na lixeira (restaurar / apagar de vez) ou arquivados
export default function TrashPanel({ mode, onClose, folders, onChanged, toast, onAuthError }) {
  const [notes, setNotes] = useState(null);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const cfg = MODES[mode];

  const load = useCallback(async () => {
    try {
      setNotes((await api(cfg.endpoint)).notes);
    } catch (err) {
      onAuthError(err);
    }
  }, [cfg, onAuthError]);

  useEffect(() => {
    if (!mode) return;
    setNotes(null);
    setConfirmEmpty(false);
    load();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, load, onClose]);

  const folderLabel = (id) => {
    const f = folders.find((x) => x.id === id);
    return f ? `${f.icon} ${f.name}` : '📌 Mural geral';
  };

  async function run(path, method, body, removeId) {
    try {
      const data = await api(path, { method, body });
      if (removeId) setNotes((list) => list.filter((n) => n.id !== removeId));
      else await load();
      if (data.message) toast(data.message, 'success');
      onChanged();
    } catch (err) {
      onAuthError(err);
    }
  }

  return (
    <AnimatePresence>
      {mode && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            className="trash-panel"
            role="dialog"
            aria-label={cfg.title}
            initial={{ y: 40, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <header className="trash-head">
              <h2>
                <Icon name={cfg.icon} size={20} /> {cfg.title}
              </h2>
              {mode === 'trash' && notes?.length > 0 && (
                <button
                  type="button"
                  className={`btn-ghost-light small ${confirmEmpty ? 'danger' : ''}`}
                  onClick={() => (confirmEmpty ? run('/notes/trash', 'DELETE') : setConfirmEmpty(true))}
                >
                  {confirmEmpty ? 'Apagar tudo para sempre?' : 'Esvaziar lixeira'}
                </button>
              )}
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
                <Icon name="x" size={18} />
              </button>
            </header>

            <div className="trash-list">
              {notes === null && <p className="trash-empty">Carregando...</p>}
              {notes?.length === 0 && <p className="trash-empty">{cfg.empty}</p>}
              <AnimatePresence>
                {notes?.map((n) => (
                  <motion.div
                    key={n.id}
                    layout
                    className={`trash-item postit-${n.color}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
                  >
                    <div className="trash-text">
                      <strong>{n.title}</strong>
                      {n.content && <small>{n.content.slice(0, 90)}</small>}
                      <span className="trash-meta">
                        {n.sharedTrash ? (
                          <>
                            <Icon name="users" size={13} /> {n.folderName} · pasta de {n.ownerName}
                          </>
                        ) : (
                          folderLabel(n.folderId)
                        )}
                        {mode === 'trash' && ` · apaga sozinho em ${daysLeftInTrash(n.deletedAt)} dias`}
                      </span>
                    </div>
                    <div className="trash-actions">
                      {mode === 'trash' ? (
                        <>
                          <button type="button" className="btn-dark small" onClick={() => run(`/notes/${n.id}/restore`, 'POST', undefined, n.id)}>
                            ↩ Restaurar
                          </button>
                          {/* do grupo: quem excluiu pode desfazer, mas só a dona apaga de vez */}
                          {n.sharedTrash ? (
                            <small className="trash-owner-only" title="Só quem criou a pasta pode apagar de vez">
                              só {n.ownerName.split(' ')[0]} apaga de vez
                            </small>
                          ) : (
                            <button type="button" className="btn-ghost small" onClick={() => run(`/notes/${n.id}/permanent`, 'DELETE', undefined, n.id)}>
                              Apagar de vez
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="btn-dark small"
                            onClick={() => run(`/notes/${n.id}/archive`, 'POST', { archived: false }, n.id)}
                          >
                            ↩ Voltar ao mural
                          </button>
                          <button type="button" className="btn-ghost small" onClick={() => run(`/notes/${n.id}`, 'DELETE', undefined, n.id)}>
                            Excluir
                          </button>
                        </>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
