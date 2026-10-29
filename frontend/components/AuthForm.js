'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { api, hasSession, markLoggedIn } from '@/lib/api';
import { applyCachedAppearance } from '@/lib/appearance';
import { useToast } from './Toasts';

const FLOATING = [
  { color: 'yellow', text: 'Comprar pão 🥖', x: '8%', y: '14%', r: -8 },
  { color: 'pink', text: 'Niver da Ana 🎂', x: '78%', y: '18%', r: 6 },
  { color: 'blue', text: 'Estudar Next.js', x: '12%', y: '72%', r: 5 },
  { color: 'green', text: 'Academia 💪', x: '80%', y: '70%', r: -6 },
];

export default function AuthForm({ mode }) {
  const isRegister = mode === 'register';
  const router = useRouter();
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    applyCachedAppearance();
    try {
      const bye = sessionStorage.getItem('mural_bye');
      if (bye) {
        sessionStorage.removeItem('mural_bye');
        toast(bye, 'info', { duration: 12000 });
      }
    } catch {}
    if (hasSession()) router.replace('/');
  }, [router]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // Front envia o input -> back valida e salva no SQLite -> responde
      const data = await api(isRegister ? '/auth/register' : '/auth/login', {
        method: 'POST',
        body: isRegister ? form : { email: form.email, password: form.password },
      });
      markLoggedIn(); // a sessão em si fica num cookie seguro que o back criou
      toast(data.message, 'success');
      router.replace('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <div className="stars" />
      {FLOATING.map((f, i) => (
        <motion.div
          key={f.text}
          className={`floating-note postit-${f.color}`}
          style={{ left: f.x, top: f.y }}
          initial={{ opacity: 0, scale: 0.5, rotate: f.r }}
          animate={{ opacity: 0.85, scale: 1, rotate: [f.r, -f.r, f.r], y: [0, -16, 0] }}
          transition={{
            delay: 0.15 * i,
            duration: 6 + i,
            repeat: Infinity,
            ease: 'easeInOut',
            opacity: { delay: 0.15 * i, duration: 0.6 },
            scale: { delay: 0.15 * i, type: 'spring' },
          }}
        >
          {f.text}
        </motion.div>
      ))}

      <motion.form
        className="auth-card"
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 160, damping: 18 }}
      >
        <motion.div
          className="auth-logo"
          animate={{ rotate: [0, -12, 12, 0] }}
          transition={{ repeat: Infinity, duration: 3, repeatDelay: 2 }}
        >
          📌
        </motion.div>
        {/* quem chega pela primeira vez precisa saber onde está e para que serve (IHC: golfo de avaliação) */}
        <p className="auth-brand">Mural de Notas</p>
        <h1>{isRegister ? 'Crie seu mural' : 'Entre no seu mural'}</h1>
        <p className="auth-sub">Seus post-its, lembretes e datas especiais num só lugar — no PC e no celular.</p>

        {isRegister && (
          <label className="field">
            <span>Nome</span>
            <input value={form.name} onChange={set('name')} placeholder="Como quer ser chamado?" autoComplete="name" />
          </label>
        )}
        <label className="field">
          <span>E-mail</span>
          <input type="email" value={form.email} onChange={set('email')} placeholder="voce@email.com" autoComplete="email" />
        </label>
        <div className="field">
          <label htmlFor="auth-password">Senha</label>
          <div className="password-wrap">
            <input
              id="auth-password"
              type={showPass ? 'text' : 'password'}
              value={form.password}
              onChange={set('password')}
              placeholder={isRegister ? 'Crie uma senha' : 'Sua senha'}
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              aria-describedby={isRegister ? 'auth-password-hint' : undefined}
            />
            <button
              type="button"
              className="show-pass"
              onClick={() => setShowPass((s) => !s)}
              aria-label={showPass ? 'Esconder senha' : 'Mostrar senha'}
              aria-pressed={showPass}
              title={showPass ? 'Esconder senha' : 'Mostrar senha'}
            >
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" />
                <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" strokeWidth="2" />
                {showPass && <path stroke="currentColor" strokeWidth="2" strokeLinecap="round" d="M4 4l16 16" />}
              </svg>
            </button>
          </div>
          {isRegister && (
            <small id="auth-password-hint" className={`field-hint ${form.password && form.password.length < 6 ? 'warn' : ''}`}>
              {form.password.length >= 6 ? '✓ Tamanho ok' : `Mínimo de 6 caracteres${form.password ? ` (faltam ${6 - form.password.length})` : ''}`}
            </small>
          )}
        </div>

        {error && (
          <motion.p className="auth-error" initial={{ x: -10 }} animate={{ x: [10, -8, 6, 0] }}>
            {error}
          </motion.p>
        )}

        <motion.button className="btn-primary" disabled={loading} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          {loading ? 'Enviando...' : isRegister ? 'Cadastrar' : 'Entrar'}
        </motion.button>

        {isRegister ? (
          <p className="auth-switch">
            Já tem conta? <Link href="/login">Entrar</Link>
          </p>
        ) : (
          <>
            <div className="auth-or">
              <span>primeira vez aqui?</span>
            </div>
            <Link href="/cadastro" className="btn-secondary">
              Criar conta grátis
            </Link>
          </>
        )}
      </motion.form>
    </main>
  );
}
