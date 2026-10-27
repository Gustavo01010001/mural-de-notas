import { Router } from 'express';
import { AuthController } from '../controllers/authController.js';
import { NoteController } from '../controllers/noteController.js';
import { AlertController } from '../controllers/alertController.js';
import { WeatherController } from '../controllers/weatherController.js';
import { SettingsController } from '../controllers/settingsController.js';
import { FolderController } from '../controllers/folderController.js';
import { requireAuth } from '../middlewares/auth.js';

export const router = Router();

router.get('/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Autenticação / cadastro
router.post('/auth/register', AuthController.register);
router.post('/auth/login', AuthController.login);
router.get('/auth/me', requireAuth, AuthController.me);
router.post('/auth/logout', requireAuth, AuthController.logout);

// Pastas
router.get('/folders', requireAuth, FolderController.list);
router.post('/folders', requireAuth, FolderController.create);
router.put('/folders/:id', requireAuth, FolderController.update);
router.delete('/folders/:id', requireAuth, FolderController.remove);

// Post-its
router.get('/notes', requireAuth, NoteController.list);
router.get('/notes/search', requireAuth, NoteController.search);
router.post('/notes', requireAuth, NoteController.create);
router.put('/notes/:id', requireAuth, NoteController.update);
router.patch('/notes/:id/position', requireAuth, NoteController.move);
router.patch('/notes/:id/folder', requireAuth, NoteController.moveToFolder);
router.delete('/notes/:id', requireAuth, NoteController.remove);

// Alertas de datas importantes
router.get('/alerts', requireAuth, AlertController.today);
router.post('/alerts/:id/dismiss', requireAuth, AlertController.dismiss);

// Configurações e perfil
router.get('/settings', requireAuth, SettingsController.get);
router.put('/settings', requireAuth, SettingsController.update);
router.put('/profile', requireAuth, SettingsController.updateProfile);

// Clima e hora
router.get('/weather', WeatherController.current);
