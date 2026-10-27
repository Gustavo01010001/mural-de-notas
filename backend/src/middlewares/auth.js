import { SessionModel } from '../models/sessionModel.js';
import { HttpError } from '../utils/httpError.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = token ? SessionModel.findUserByToken(token) : null;
  if (!user) throw new HttpError(401, 'Sessão expirada. Entre novamente.');
  req.user = user;
  req.token = token;
  next();
}
