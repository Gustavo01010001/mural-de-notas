import os from 'node:os';
import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import './config/db.js';

// IPs desta máquina na rede local (Wi-Fi/cabo)
function lanIPs() {
  return Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => i.address);
}

const app = express();
const PORT = Number(process.env.PORT) || 4000;
// Por padrão a API só aceita conexões do próprio PC: o navegador (PC ou celular)
// fala com o front, e o Next repassa /api para cá. Use HOST=0.0.0.0 para expor na rede.
const HOST = process.env.HOST || '127.0.0.1';
const FRONT_URL = process.env.FRONT_URL || 'https://localhost:3000';

// CORS só importa se alguém chamar a API direto (NEXT_PUBLIC_API_URL): front configurado
// ou front aberto pelo IP da rede local, em http ou https
const allowed = FRONT_URL.split(',').map((s) => s.trim());
const LAN_FRONT = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3000$/;
app.use(
  cors({
    origin: (origin, done) => done(null, !origin || allowed.includes(origin) || LAN_FRONT.test(origin)),
  }),
);
app.use(express.json({ limit: '100kb' }));

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, HOST, () => {
  console.log(`API rodando em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api`);
  console.log('  abra o front em:  https://localhost:3000');
  for (const ip of lanIPs()) console.log(`  no celular (mesma rede):  https://${ip}:3000`);
  console.log(`Clima via ${process.env.GOOGLE_WEATHER_API_KEY ? 'Google Weather API' : 'Open-Meteo (sem chave)'}`);
});
