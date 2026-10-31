import os from 'node:os';
import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import './config/db.js';
import { NoteModel } from './models/noteModel.js';
import { UserModel } from './models/userModel.js';
import { SessionModel } from './models/sessionModel.js';
import { startAutomaticBackups } from './services/backupService.js';

// IPs desta máquina na rede local (Wi-Fi/cabo)
function lanIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address);
}

const app = express();
// Não anuncia "X-Powered-By: Express" (facilitaria procurar falhas conhecidas da versão)
app.disable('x-powered-by');
const PORT = Number(process.env.PORT) || 4000;
// Por padrão a API só aceita conexões do próprio PC: o navegador (PC ou celular)
// fala com o front, e o Next repassa /api para cá. Use HOST=0.0.0.0 para expor na rede.
const HOST = process.env.HOST || '127.0.0.1';
const FRONT_URL = process.env.FRONT_URL || 'https://localhost:3000';

// CORS só importa se alguém chamar a API direto (NEXT_PUBLIC_API_URL): front configurado
// ou front aberto pelo IP da rede local, em http ou https
const allowed = FRONT_URL.split(',').map((s) => s.trim());
const LAN_FRONT = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3000$/;
// Cabeçalhos de segurança da API (só responde JSON e imagens: nada precisa rodar script nem ser embutido)
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'none'; img-src 'self'; frame-ancestors 'none'",
    'Cross-Origin-Resource-Policy': 'same-site',
  });
  next();
});

app.use(
  cors({
    origin: (origin, done) => done(null, !origin || allowed.includes(origin) || LAN_FRONT.test(origin)),
  }),
);
// Corpo pequeno para tudo, exceto o envio de foto (imagem já reduzida pelo front, em base64)
const smallJson = express.json({ limit: '100kb' });
const imageJson = express.json({ limit: '2.5mb' });
const importJson = express.json({ limit: '25mb' }); // backup com fotos
app.use((req, res, next) =>
  (/\/notes\/\d+\/image$/.test(req.path) ? imageJson : req.path === '/api/account/import' ? importJson : smallJson)(req, res, next),
);

// Limpezas diárias: lixeira antiga, contas excluídas há mais de 30 dias e sessões vencidas
function dailyCleanup() {
  NoteModel.purgeOldTrash();
  const purged = UserModel.purgeDeleted();
  if (purged) console.log(`[contas] ${purged} conta(s) excluída(s) de vez (prazo de 30 dias acabou)`);
  SessionModel.purgeExpired();
}
dailyCleanup();
setInterval(dailyCleanup, 24 * 60 * 60 * 1000).unref();
startAutomaticBackups();

// Atrás do proxy do Next: confia no x-forwarded-proto para saber se é HTTPS (cookie Secure)
app.set('trust proxy', 'loopback');

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`API rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api`);
  console.log('  abra o front em:  https://localhost:3000');
  for (const ip of lanIPs()) console.log(`  no celular (mesma rede):  https://${ip}:3000`);
  console.log(`Clima via ${process.env.GOOGLE_WEATHER_API_KEY ? 'Google Weather API' : 'Open-Meteo (sem chave)'}`);
  console.log(`E-mail: ${process.env.SMTP_HOST ? 'configurado' : 'não configurado (links de senha aparecem aqui)'} · Google: ${process.env.GOOGLE_CLIENT_ID ? 'configurado' : 'não configurado'}`);
});
