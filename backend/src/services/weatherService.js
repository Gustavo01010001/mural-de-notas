// Clima e hora atual.
// - Se GOOGLE_WEATHER_API_KEY estiver no .env, usa a Google Weather API (Google Maps Platform).
// - Senão, usa a Open-Meteo (gratuita, sem chave) para o projeto funcionar de cara.
// O resultado é normalizado no mesmo formato, então o front não sabe (nem precisa saber) a fonte.
import { HttpError } from '../utils/httpError.js';

const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();

// condition: clear | partly | clouds | fog | rain | storm | snow
const WMO = {
  0: ['clear', 'Céu limpo'],
  1: ['partly', 'Predomínio de sol'],
  2: ['partly', 'Parcialmente nublado'],
  3: ['clouds', 'Nublado'],
  45: ['fog', 'Neblina'],
  48: ['fog', 'Neblina com geada'],
  51: ['rain', 'Garoa fraca'],
  53: ['rain', 'Garoa'],
  55: ['rain', 'Garoa forte'],
  56: ['rain', 'Garoa congelante'],
  57: ['rain', 'Garoa congelante'],
  61: ['rain', 'Chuva fraca'],
  63: ['rain', 'Chuva'],
  65: ['rain', 'Chuva forte'],
  66: ['rain', 'Chuva congelante'],
  67: ['rain', 'Chuva congelante'],
  71: ['snow', 'Neve fraca'],
  73: ['snow', 'Neve'],
  75: ['snow', 'Neve forte'],
  77: ['snow', 'Grãos de neve'],
  80: ['rain', 'Pancadas de chuva'],
  81: ['rain', 'Pancadas de chuva'],
  82: ['rain', 'Pancadas fortes'],
  85: ['snow', 'Pancadas de neve'],
  86: ['snow', 'Pancadas de neve'],
  95: ['storm', 'Tempestade'],
  96: ['storm', 'Tempestade com granizo'],
  99: ['storm', 'Tempestade com granizo'],
};

function googleCondition(type = '') {
  if (type.includes('THUNDER')) return 'storm';
  if (type.includes('SNOW') || type.includes('HAIL')) return 'snow';
  if (type.includes('RAIN') || type.includes('SHOWER') || type.includes('DRIZZLE')) return 'rain';
  if (type.includes('FOG') || type.includes('HAZE')) return 'fog';
  if (type === 'CLEAR') return 'clear';
  if (type === 'MOSTLY_CLEAR' || type === 'PARTLY_CLOUDY') return 'partly';
  return 'clouds';
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${new URL(url).host}`);
  return res.json();
}

async function fromGoogle(lat, lon, key) {
  const url =
    'https://weather.googleapis.com/v1/currentConditions:lookup' +
    `?key=${encodeURIComponent(key)}&location.latitude=${lat}&location.longitude=${lon}&languageCode=pt-BR`;
  const [d, f] = await Promise.all([
    getJson(url),
    // previsão de 5 dias (se falhar, o clima de agora continua aparecendo)
    getJson(
      'https://weather.googleapis.com/v1/forecast/days:lookup' +
        `?key=${encodeURIComponent(key)}&location.latitude=${lat}&location.longitude=${lon}&days=5&languageCode=pt-BR`,
    ).catch(() => null),
  ]);
  const forecast = (f?.forecastDays ?? []).slice(0, 5).map((day) => {
    const dd = day.displayDate ?? {};
    return {
      date: dd.year ? `${dd.year}-${String(dd.month).padStart(2, '0')}-${String(dd.day).padStart(2, '0')}` : null,
      condition: googleCondition(day.daytimeForecast?.weatherCondition?.type),
      description: day.daytimeForecast?.weatherCondition?.description?.text ?? '',
      max: day.maxTemperature?.degrees ?? null,
      min: day.minTemperature?.degrees ?? null,
      rain: day.daytimeForecast?.precipitation?.probability?.percent ?? null,
    };
  });
  return {
    forecast,
    source: 'google',
    temperature: d.temperature?.degrees ?? null,
    feelsLike: d.feelsLikeTemperature?.degrees ?? null,
    humidity: d.relativeHumidity ?? null,
    wind: d.wind?.speed?.value ?? null,
    max: d.currentConditionsHistory?.maxTemperature?.degrees ?? null,
    min: d.currentConditionsHistory?.minTemperature?.degrees ?? null,
    isDay: d.isDaytime ?? true,
    condition: googleCondition(d.weatherCondition?.type),
    description: d.weatherCondition?.description?.text ?? '',
    timeZone: d.timeZone?.id ?? null,
  };
}

async function fromOpenMeteo(lat, lon) {
  const url =
    'https://api.open-meteo.com/v1/forecast' +
    `?latitude=${lat}&longitude=${lon}` +
    '&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m' +
    '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5';
  const d = await getJson(url);
  const c = d.current;
  const [condition, description] = WMO[c.weather_code] ?? ['clouds', 'Tempo instável'];
  const daily = d.daily ?? {};
  const forecast = (daily.time ?? []).map((date, i) => {
    const [cond, desc] = WMO[daily.weather_code?.[i]] ?? ['clouds', 'Tempo instável'];
    return {
      date,
      condition: cond,
      description: desc,
      max: daily.temperature_2m_max?.[i] ?? null,
      min: daily.temperature_2m_min?.[i] ?? null,
      rain: daily.precipitation_probability_max?.[i] ?? null,
    };
  });
  return {
    forecast,
    source: 'open-meteo',
    temperature: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    wind: c.wind_speed_10m,
    max: d.daily?.temperature_2m_max?.[0] ?? null,
    min: d.daily?.temperature_2m_min?.[0] ?? null,
    isDay: c.is_day === 1,
    condition,
    description,
    timeZone: d.timezone,
  };
}

async function cityName(lat, lon) {
  try {
    const d = await getJson(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=10&accept-language=pt-BR`,
      { 'User-Agent': 'mural-de-notas/1.0' },
    );
    const a = d.address ?? {};
    return a.city || a.town || a.village || a.municipality || a.state || null;
  } catch {
    return null;
  }
}

export async function getWeather(latRaw, lonRaw) {
  const lat = Number(latRaw);
  const lon = Number(lonRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    throw new HttpError(400, 'Coordenadas inválidas.');
  }

  // Arredonda para ~1km e reaproveita por 10 min (evita estourar limite das APIs)
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return { ...hit.data, serverTime: new Date().toISOString() };

  const googleKey = process.env.GOOGLE_WEATHER_API_KEY;
  let weather;
  try {
    weather = googleKey ? await fromGoogle(lat, lon, googleKey) : await fromOpenMeteo(lat, lon);
  } catch (err) {
    if (!googleKey) throw new HttpError(502, 'Não foi possível consultar o clima agora.');
    console.warn('[clima] Google falhou, usando Open-Meteo:', err.message);
    weather = await fromOpenMeteo(lat, lon);
  }

  const data = { ...weather, city: await cityName(lat, lon), lat, lon };
  cache.set(key, { at: Date.now(), data });
  return { ...data, serverTime: new Date().toISOString() };
}
