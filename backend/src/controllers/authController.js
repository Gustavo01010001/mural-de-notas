import { UserModel } from '../models/userModel.js';
import { SessionModel } from '../models/sessionModel.js';
import { clearSessionCookie, setSessionCookie } from '../middlewares/auth.js';
import { mailConfigured, sendPasswordReset } from '../services/mailService.js';
import { googleConfigured, verifyGoogleIdToken } from '../services/googleAuth.js';
import { HttpError } from '../utils/httpError.js';
import { hashPassword, NO_PASSWORD, verifyPassword } from '../utils/password.js';
import { clearHits, hit } from '../utils/rateLimit.js';
import { validateLogin, validateRegister } from '../utils/validators.js';

// IP de quem pediu (o Express só confia no x-forwarded-for quando vem do proxy local, o Next)
const ipOf = (req) => req.ip || '?';

/**
 * Abre a sessão: no navegador vai num cookie seguro (httpOnly).
 * Só clientes de API (scripts/testes, que não mandam X-Mural) recebem o token no corpo.
 */
function startSession(req, res, userId) {
  const token = SessionModel.create(userId);
  setSessionCookie(req, res, token);
  return req.headers['x-mural'] === '1' ? {} : { token };
}

function validNewPassword(raw) {
  const password = String(raw ?? '');
  if (password.length < 6) throw new HttpError(400, 'A senha precisa ter pelo menos 6 caracteres.');
  if (password.length > 200) throw new HttpError(400, 'Senha muito longa.');
  return password;
}

// Endereço do front para montar o link do e-mail (o mesmo de onde o pedido veio, se for conhecido)
function frontUrl(req) {
  const origin = req.headers.origin ?? '';
  if (/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/.test(origin)) return origin;
  return (process.env.PUBLIC_URL || process.env.FRONT_URL || 'https://localhost:3000').split(',')[0].trim();
}

export const AuthController = {
  // O que está ligado neste servidor (o front mostra ou esconde os botões)
  config(_req, res) {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null, mail: mailConfigured() });
  },

  // Front envia o formulário -> back valida, salva no SQLite e responde
  register(req, res) {
    hit(`register:${ipOf(req)}`, { max: 10, windowMs: 60 * 60_000 });
    const { name, email, password } = validateRegister(req.body);
    if (UserModel.findByEmailWithPassword(email)) throw new HttpError(409, 'Este e-mail já está cadastrado.');
    const user = UserModel.create({ name, email, passwordHash: hashPassword(password) });
    res.status(201).json({ message: `Bem-vindo(a), ${user.name}!`, user, ...startSession(req, res, user.id) });
  },

  login(req, res) {
    const { email, password } = validateLogin(req.body);
    const key = `login:${ipOf(req)}:${email}`;
    hit(key, { max: 8, windowMs: 15 * 60_000, message: 'Muitas tentativas de login. Espere uns minutos ou use "Esqueci minha senha".' });

    const row = UserModel.findByEmailWithPassword(email);
    if (!row || !verifyPassword(password, row.password_hash)) throw new HttpError(401, 'E-mail ou senha incorretos.');
    clearHits(key);

    // Conta estava "em exclusão": entrar de novo dentro do prazo recupera tudo
    let message = `Olá de novo, ${row.name}!`;
    if (row.deleted_at) {
      UserModel.restore(row.id);
      message = `Que bom que voltou, ${row.name}! Sua conta e seus post-its foram recuperados. 🎉`;
    }
    res.json({ message, user: UserModel.findById(row.id), ...startSession(req, res, row.id) });
  },

  // POST /auth/google { credential } — ID token vindo do botão do Google
  async google(req, res) {
    if (!googleConfigured()) throw new HttpError(503, 'Login com Google não está configurado neste servidor.');
    hit(`google:${ipOf(req)}`, { max: 20, windowMs: 15 * 60_000 });
    const g = await verifyGoogleIdToken(req.body?.credential);

    let row = UserModel.findByGoogleSub(g.sub);
    let message;
    if (!row) {
      row = UserModel.findByEmailWithPassword(g.email);
      if (row) {
        UserModel.linkGoogle(row.id, g.sub); // mesma pessoa (e-mail confirmado pelo Google)
        message = `Conta Google vinculada. Olá, ${row.name}!`;
      } else {
        const user = UserModel.create({ name: g.name, email: g.email, passwordHash: NO_PASSWORD, googleSub: g.sub });
        row = UserModel.findRawById(user.id);
        message = `Bem-vindo(a), ${user.name}!`;
      }
    }
    if (row.deleted_at) {
      UserModel.restore(row.id);
      message = `Que bom que voltou, ${row.name}! Sua conta foi recuperada. 🎉`;
    }
    res.json({ message: message ?? `Olá de novo, ${row.name}!`, user: UserModel.findById(row.id), ...startSession(req, res, row.id) });
  },

  // POST /auth/forgot { email } — sempre a mesma resposta (não revela quem tem conta)
  async forgot(req, res) {
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    hit(`forgot:${ipOf(req)}`, { max: 6, windowMs: 15 * 60_000 });
    hit(`forgot-mail:${email}`, { max: 3, windowMs: 60 * 60_000, message: 'Já enviamos alguns e-mails para esse endereço. Espere um pouco.' });

    const row = email ? UserModel.findByEmailWithPassword(email) : null;
    const reply = { message: 'Se esse e-mail tiver conta, enviamos um link para criar uma senha nova (vale 30 minutos).', mail: mailConfigured() };
    if (row && !row.deleted_at) {
      const token = UserModel.createResetToken(row.id);
      const link = `${frontUrl(req)}/redefinir?codigo=${token}`;
      try {
        await sendPasswordReset({ to: row.email, name: row.name, link });
      } catch (err) {
        console.error('[e-mail] falhou:', err.message);
      }
      // Só em desenvolvimento e se você ligar de propósito (DEV_SHOW_RESET_LINK=1): devolve o link na resposta
      if (!mailConfigured() && process.env.DEV_SHOW_RESET_LINK === '1') reply.devLink = link;
    }
    res.json(reply);
  },

  // POST /auth/reset { token, password } — cria a senha nova e já entra
  reset(req, res) {
    hit(`reset:${ipOf(req)}`, { max: 10, windowMs: 15 * 60_000 });
    const password = validNewPassword(req.body?.password);
    const userId = UserModel.consumeResetToken(req.body?.token);
    if (!userId) throw new HttpError(400, 'Esse link já foi usado ou expirou. Peça um novo em "Esqueci minha senha".');
    UserModel.setPassword(userId, hashPassword(password));
    SessionModel.removeAllForUser(userId); // derruba sessões antigas (ex.: alguém que sabia a senha velha)
    const user = UserModel.findById(userId);
    res.json({ message: 'Senha nova criada! Você já está dentro. 🔐', user, ...startSession(req, res, userId) });
  },

  // POST /auth/password { current, password } — trocar (ou criar, se entrou só com Google)
  changePassword(req, res) {
    const row = UserModel.findRawById(req.user.id);
    const hasPassword = row.password_hash !== NO_PASSWORD;
    if (hasPassword && !verifyPassword(String(req.body?.current ?? ''), row.password_hash)) {
      throw new HttpError(401, 'A senha atual não confere.');
    }
    UserModel.setPassword(row.id, hashPassword(validNewPassword(req.body?.password)));
    SessionModel.removeAllForUser(row.id, req.token); // outras sessões saem
    res.json({ message: hasPassword ? 'Senha trocada!' : 'Senha criada! Agora você também pode entrar com e-mail e senha.' });
  },

  me(req, res) {
    res.json({ user: req.user });
  },

  // Quem ainda tinha o token antigo no navegador troca por um cookie seguro (uma vez só)
  upgradeToCookie(req, res) {
    SessionModel.remove(req.token);
    startSession(req, res, req.user.id);
    res.json({ ok: true });
  },

  logout(req, res) {
    SessionModel.remove(req.token);
    clearSessionCookie(req, res);
    res.json({ message: 'Até logo!' });
  },
};

