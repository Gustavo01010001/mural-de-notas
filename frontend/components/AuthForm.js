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
        <h1>{isRegister ? 'Crie seu mural' : 'Bem-vindo de volta'}</h1>
        <p className="auth-sub">
          {isRegister ? 'Suas notas, lembretes e datas especiais num só lugar.' : 'Entre para ver seus post-its.'}
        </p>

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
        <label className="field">
          <span>Senha</span>
          <input
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder={isRegister ? 'Mínimo 6 caracteres' : 'Sua senha'}
            autoComplete={isRegister ? 'new-password' : 'current-password'}
          />
        </label>

        {error && (
          <motion.p className="auth-error" initial={{ x: -10 }} animate={{ x: [10, -8, 6, 0] }}>
            {error}
          </motion.p>
        )}

        <motion.button className="btn-primary" disabled={loading} whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
          {loading ? 'Enviando...' : isRegister ? 'Cadastrar' : 'Entrar'}
        </motion.button>

        <p className="auth-switch">
          {isRegister ? 'Já tem conta? ' : 'Ainda não tem conta? '}
          <Link href={isRegister ? '/login' : '/cadastro'}>{isRegister ? 'Entrar' : 'Cadastre-se'}</Link>
        </p>
      </motion.form>
    </main>
  );
}
