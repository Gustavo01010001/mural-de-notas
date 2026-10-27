import { UserModel } from '../models/userModel.js';
import { SessionModel } from '../models/sessionModel.js';
import { HttpError } from '../utils/httpError.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { validateLogin, validateRegister } from '../utils/validators.js';

export const AuthController = {
  // Front envia o formulário -> back valida, salva no SQLite e responde com o usuário + token
  register(req, res) {
    const { name, email, password } = validateRegister(req.body);
    if (UserModel.findByEmailWithPassword(email)) {
      throw new HttpError(409, 'Este e-mail já está cadastrado.');
    }
    const user = UserModel.create({ name, email, passwordHash: hashPassword(password) });
    const token = SessionModel.create(user.id);
    res.status(201).json({ message: `Bem-vindo(a), ${user.name}!`, token, user });
  },

  login(req, res) {
    const { email, password } = validateLogin(req.body);
    const row = UserModel.findByEmailWithPassword(email);
    if (!row || !verifyPassword(password, row.password_hash)) {
      throw new HttpError(401, 'E-mail ou senha incorretos.');
    }
    const user = UserModel.findById(row.id);
    const token = SessionModel.create(user.id);
    res.json({ message: `Olá de novo, ${user.name}!`, token, user });
  },

  me(req, res) {
    res.json({ user: req.user });
  },

  logout(req, res) {
    SessionModel.remove(req.token);
    res.json({ message: 'Até logo!' });
  },
};
