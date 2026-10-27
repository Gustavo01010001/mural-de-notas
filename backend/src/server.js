import express from 'express';
import cors from 'cors';
import { router } from './routes/index.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';
import './config/db.js';

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const FRONT_URL = process.env.FRONT_URL || 'http://localhost:3000';

app.use(cors({ origin: FRONT_URL.split(',') }));
app.use(express.json({ limit: '100kb' }));

app.use('/api', router);
app.use(notFound);
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API rodando em http://localhost:${PORT}/api`);
  console.log(`Clima via ${process.env.GOOGLE_WEATHER_API_KEY ? 'Google Weather API' : 'Open-Meteo (sem chave)'}`);
});
