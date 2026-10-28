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
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:3000';

// Aceita o front configurado + o front aberto pelo IP da rede local (para testar no celular)
const allowed = FRONT_URL.split(',').map((s) => s.trim());
const LAN_FRONT = /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}):3000$/;
app.use(
  cors({
    origin: (origin, done) => done(null, !origin || allowed.includes(origin) || LAN_FRONT.test(origin)),
  }),
);
app.use(express.json({ limit: '100kb' }));

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, '0.0.0.0', () => {
  console.log(`API rodando em http://localhost:${PORT}/api`);
  for (const ip of lanIPs()) console.log(`  na rede local:  http://${ip}:${PORT}/api`);
  console.log(`Clima via ${process.env.GOOGLE_WEATHER_API_KEY ? 'Google Weather API' : 'Open-Meteo (sem chave)'}`);
});
