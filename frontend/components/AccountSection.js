'use client';

// Conta e LGPD nas configurações: baixar backup, salvar em PDF, importar backup,
// trocar senha e excluir conta (com 30 dias para voltar atrás).
import { useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api, API_URL, SAFE_HEADERS } from '@/lib/api';
import Icon from './Icon';

export default function AccountSection({ user, toast, onAuthError, onImported, onDeleted }) {
  const [busy, setBusy] = useState(null);
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [delOpen, setDelOpen] = useState(false);
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const fileRef = useRef(null);
  const hasPassword = user?.hasPassword !== false;

  async function downloadBackup() {
    setBusy('backup');
    try {
      const res = await fetch(`${API_URL}/account/export`, { credentials: 'same-origin', headers: SAFE_HEADERS });
      if (!res.ok) throw new Error('Não consegui gerar o backup.');
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') ?? '')?.[1] ?? 'mural-de-notas-backup.json';
      const url = URL.createObjectURL(blob);
      const a = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast('Backup baixado! Guarde o arquivo num lugar seguro. 💾', 'success');
      return true;
    } catch (err) {
      toast(err.message, 'error');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function importBackup(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('import');
    try {
      const backup = JSON.parse(await file.text());
      const data = await api('/account/import', { method: 'POST', body: { backup } });
      toast(data.message, 'success');
      onImported();
    } catch (err) {
      if (err.status === 401) onAuthError(err);
      else toast(err instanceof SyntaxError ? 'Esse arquivo não é um backup válido.' : err.message, 'error');
    } finally {
      setBusy(null);
    }
  }

  async function changePassword(e) {
    e.preventDefault();
    setError('');
    try {
      const data = await api('/auth/password', { method: 'POST', body: { current: pw.current, password: pw.next } });
      toast(data.message, 'success');
      setPw({ current: '', next: '' });
      setPwOpen(false);
    } catch (err) {
      if (err.status === 401 && !hasPassword) onAuthError(err);
      else setError(err.message);
    }
  }

  async function deleteAccount(e) {
    e.preventDefault();
    setError('');
    setBusy('delete');
    try {
      const body = hasPassword ? { password: confirm } : { confirmEmail: confirm };
      const data = await api('/account', { method: 'DELETE', body });
      onDeleted(data.message);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="account-section">
      <h3>Conta e privacidade</h3>
      <div className="account-buttons">
        <button type="button" className="account-btn" onClick={downloadBackup} disabled={busy === 'backup'}>
          <Icon name="download" size={20} /> <span>{busy === 'backup' ? 'Gerando...' : 'Baixar backup'}</span>
          <small>Arquivo com todos os post-its, pastas e fotos</small>
        </button>
        <a className="account-btn" href="/exportar" target="_blank" rel="noopener">
          <Icon name="printer" size={20} /> <span>Salvar em PDF</span>
          <small>Abre uma página para imprimir ou salvar como PDF</small>
        </a>
        <button type="button" className="account-btn" onClick={() => fileRef.current?.click()} disabled={busy === 'import'}>
          <Icon name="upload" size={20} /> <span>{busy === 'import' ? 'Importando...' : 'Importar backup'}</span>
          <small>Traz de volta um arquivo de backup (soma ao que já existe)</small>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={importBackup} />
      </div>

      <button type="button" className="btn-text account-toggle" onClick={() => (setPwOpen((o) => !o), setError(''))}>
        <Icon name="key" size={15} /> {hasPassword ? 'Trocar senha' : 'Criar uma senha'}
      </button>
      <AnimatePresence initial={false}>
        {pwOpen && (
          <motion.form className="account-form" onSubmit={changePassword} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            {hasPassword && (
              <input type="password" autoComplete="current-password" placeholder="Senha atual" value={pw.current} onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))} />
            )}
            <input type="password" autoComplete="new-password" placeholder="Senha nova (mínimo 6)" value={pw.next} onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))} />
            <button className="btn-small" disabled={pw.next.length < 6}>
              Salvar senha
            </button>
            <small>Outros aparelhos conectados vão precisar entrar de novo.</small>
          </motion.form>
        )}
      </AnimatePresence>
      {error && !delOpen && <p className="auth-error">{error}</p>}

      <button type="button" className="btn-text account-toggle danger" onClick={() => (setDelOpen((o) => !o), setError(''), setConfirm(''))}>
        <Icon name="alert" size={15} /> Excluir minha conta
      </button>
      <AnimatePresence initial={false}>
        {delOpen && (
          <motion.form className="account-form danger" onSubmit={deleteAccount} initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
            <p>
              <b>Antes, baixe um backup</b> — com ele você recupera seus post-its em qualquer conta.
              <button type="button" className="btn-small" onClick={downloadBackup}>
                <Icon name="download" size={14} /> Baixar agora
              </button>
            </p>
            <p>
              A conta some na hora, mas fica <b>30 dias guardada</b>: se você entrar de novo nesse prazo, tudo volta (post-its,
              pastas e fotos). Depois disso, é apagada para sempre — inclusive pastas que você compartilhou.
            </p>
            <p className="account-warn">
              <Icon name="lock" size={14} /> Seus post-its <b>não são criptografados</b>. Se você anotou senhas neles, troque essas senhas e prefira um
              gerenciador de senhas para guardá-las.
            </p>
            <input
              type={hasPassword ? 'password' : 'email'}
              autoComplete={hasPassword ? 'current-password' : 'email'}
              placeholder={hasPassword ? 'Digite sua senha para confirmar' : 'Digite seu e-mail para confirmar'}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
            {error && <p className="auth-error">{error}</p>}
            <button className="btn-logout" disabled={!confirm || busy === 'delete'}>
              {busy === 'delete' ? 'Excluindo...' : 'Excluir minha conta'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </section>
  );
}
