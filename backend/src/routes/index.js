import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { NoteController } from '../controllers/noteController.js';
import { LinkController } from '../controllers/linkController.js';
import { AlertController } from '../controllers/alertController.js';
import { WeatherController } from '../controllers/weatherController.js';
import { SettingsController } from '../controllers/settingsController.js';
import { FolderController } from '../controllers/folderController.js';
import { LiveController } from '../controllers/liveController.js';
import { AccountController } from '../controllers/accountController.js';
import { requireAuth } from '../middlewares/auth.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Autenticação / cadastro
router.get('/auth/config', AuthController.config);
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.post('/auth/google', AuthController.google);
router.post('/auth/forgot', AuthController.forgot);
router.post('/auth/reset', AuthController.reset);
router.get('/auth/me', requireAuth, AuthController.me);
router.post('/auth/password', requireAuth, AuthController.changePassword);
router.post('/auth/cookie', requireAuth, AuthController.upgradeToCookie);
router.post('/auth/logout', requireAuth, AuthController.logout);

// Conta / LGPD: backup, importar e excluir
router.get('/account/export', requireAuth, AccountController.export);
router.post('/account/import', requireAuth, AccountController.import);
router.delete('/account', requireAuth, AccountController.remove);

// Pastas (subpastas, ordem, cor) e compartilhamento
router.get('/folders', requireAuth, FolderController.list);
router.post('/folders', requireAuth, FolderController.create);
router.put('/folders/order', requireAuth, FolderController.reorder);
router.put('/folders/:id', requireAuth, FolderController.update);
router.delete('/folders/:id', requireAuth, FolderController.remove);
router.get('/folders/:id/members', requireAuth, FolderController.members);
router.post('/folders/:id/members', requireAuth, FolderController.addMember);
router.delete('/folders/:id/members/:userId', requireAuth, FolderController.removeMember);

// Ao vivo nas pastas compartilhadas (presença, cursores, mudanças)
router.get('/live/folders/:id', requireAuth, LiveController.stream);
router.post('/live/folders/:id/cursor', requireAuth, LiveController.cursor);

// Post-its — rotas fixas antes das que têm :id
// Conexões entre post-its (mural infinito)
router.get('/links', requireAuth, LinkController.list);
router.post('/links', requireAuth, LinkController.create);
router.patch('/links/:id', requireAuth, LinkController.update);
router.delete('/links/:id', requireAuth, LinkController.remove);

router.get('/notes', requireAuth, NoteController.list);
router.get('/notes/search', requireAuth, NoteController.search);
router.get('/notes/tags', requireAuth, NoteController.tags);
router.get('/notes/archived', requireAuth, NoteController.archived);
router.get('/notes/trash', requireAuth, NoteController.trash);
router.delete('/notes/trash', requireAuth, NoteController.emptyTrash);
router.post('/notes/batch', requireAuth, NoteController.batch);
router.post('/notes/arrange', requireAuth, NoteController.arrange);
router.post('/notes/positions', requireAuth, NoteController.setPositions);
router.post('/notes', requireAuth, NoteController.create);
router.put('/notes/:id', requireAuth, NoteController.update);
router.patch('/notes/:id/position', requireAuth, NoteController.move);
router.patch('/notes/:id/size', requireAuth, NoteController.resize);
router.patch('/notes/:id/folder', requireAuth, NoteController.moveToFolder);
router.patch('/notes/:id/checklist/:itemId', requireAuth, NoteController.toggleChecklistItem);
router.post('/notes/:id/pin', requireAuth, NoteController.pin);
router.post('/notes/:id/archive', requireAuth, NoteController.archive);
router.post('/notes/:id/duplicate', requireAuth, NoteController.duplicate);
router.post('/notes/:id/restore', requireAuth, NoteController.restore);
router.delete('/notes/:id/permanent', requireAuth, NoteController.removeForever);
router.delete('/notes/:id', requireAuth, NoteController.remove);

// Foto do post-it (o corpo pode ser maior: imagem em base64)
router.get('/notes/:id/image', requireAuth, NoteController.getImage);
router.put('/notes/:id/image', requireAuth, NoteController.setImage);
router.delete('/notes/:id/image', requireAuth, NoteController.removeImage);

// Alertas de datas importantes
router.get('/alerts', requireAuth, AlertController.today);
router.post('/alerts/:id/dismiss', requireAuth, AlertController.dismiss);
router.get('/calendar', requireAuth, AlertController.calendar);

// Configurações e perfil
router.get('/settings', requireAuth, SettingsController.get);
router.put('/settings', requireAuth, SettingsController.update);
router.put('/profile', requireAuth, SettingsController.updateProfile);

// Clima e hora
router.get('/weather', WeatherController.current);
