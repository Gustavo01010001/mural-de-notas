'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

// Quem participa de uma pasta + convidar por e-mail (dono) ou sair da pasta (convidado)
export default function ShareModal({ folder, me, onClose, onChanged, onLeft, toast, onAuthError }) {
  const [info, setInfo] = useState(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!folder) return;
    try {
      setInfo(await api(`/folders/${folder.id}/members`));
    } catch (err) {
      onAuthError(err);
    }
  }, [folder, onAuthError]);

  useEffect(() => {
    setInfo(null);
    setEmail('');
    setError('');
    load();
  }, [load]);

  useEffect(() => {
    if (!folder) return;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [folder, onClose]);

  async function invite(e) {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      const data = await api(`/folders/${folder.id}/members`, { method: 'POST', body: { email } });
      toast(data.message, 'success');
      setEmail('');
      await load();
      onChanged();
    } catch (err) {
      if (err.status === 401) onAuthError(err);
      else setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function remove(userId) {
    try {
      const data = await api(`/folders/${folder.id}/members/${userId}`, { method: 'DELETE' });
      toast(data.message, 'info');
      if (userId === me?.id) {
        onClose();
        onLeft(folder.id);
        return;
      }
      await load();
      onChanged();
    } catch (err) {
      onAuthError(err);
    }
  }

  const isOwner = info?.role === 'owner';

  return (
    <AnimatePresence>
      {folder && (
        <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
          <motion.div
            className="share-modal"
            role="dialog"
            aria-label={`Compartilhar ${folder.name}`}
            initial={{ y: 30, opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
          >
            <header className="trash-head">
              <h2>
                👥 {folder.icon} {folder.name}
              </h2>
              <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
                ✕
              </button>
            </header>

            <div className="share-body">
              <p className="share-hint">
                {isOwner
                  ? 'Quem você convidar vê e edita os post-its desta pasta, e vocês enxergam os cursores uns dos outros ao vivo. Só você renomeia, apaga ou convida.'
                  : 'Você pode ver e editar os post-its desta pasta. Só quem criou a pasta pode convidar outras pessoas.'}
              </p>

              {isOwner && (
                <form className="share-invite" onSubmit={invite}>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="E-mail da pessoa (ela precisa ter conta)"
                    autoFocus
                  />
                  <button className="btn-small" disabled={!email.trim() || sending}>
                    {sending ? '...' : 'Convidar'}
                  </button>
                </form>
              )}
              {error && <p className="auth-error">{error}</p>}

              <ul className="share-list">
                {!info && <li className="trash-empty">Carregando...</li>}
                {info && (
                  <li>
                    <span className="avatar" style={{ background: '#495057' }}>
                      {initials(info.owner.name)}
                    </span>
                    <span className="share-name">
                      {info.owner.name} {info.owner.id === me?.id && <em>(você)</em>}
                      {info.owner.email && <small>{info.owner.email}</small>}
                    </span>
                    <span className="share-role">Dono</span>
                  </li>
                )}
                {info?.members.map((m) => (
                  <motion.li key={m.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                    <span className="avatar">{initials(m.name)}</span>
                    <span className="share-name">
                      {m.name} {m.id === me?.id && <em>(você)</em>}
                      {m.email && <small>{m.email}</small>}
                    </span>
                    {isOwner ? (
                      <button type="button" className="btn-ghost-light small" onClick={() => remove(m.id)}>
                        Remover
                      </button>
                    ) : m.id === me?.id ? (
                      <button type="button" className="btn-ghost-light small danger" onClick={() => remove(m.id)}>
                        Sair da pasta
                      </button>
                    ) : (
                      <span className="share-role">Convidado</span>
                    )}
                  </motion.li>
                ))}
                {info && info.members.length === 0 && <li className="trash-empty">Ainda não tem ninguém aqui além de você.</li>}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
