'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const FALLBACK = { lat: -23.55, lon: -46.63 }; // São Paulo, se o usuário negar a localização
const REFRESH_MS = 10 * 60 * 1000;
const RETRY_MS = 30 * 1000;

function getCoords() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve({ ...FALLBACK, located: false });
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, located: true }),
      () => resolve({ ...FALLBACK, located: false }),
      { timeout: 8000, maximumAge: REFRESH_MS },
    );
  });
}

// Busca o clima da região do usuário no back e atualiza a cada 10 min
// (usado pelo widget e pelo fundo "Tempo real")
export function useWeather() {
  const [weather, setWeather] = useState(null);
  const [fails, setFails] = useState(0); // falhas seguidas (0 = clima ok)

  const load = useCallback(async () => {
    try {
      const { lat, lon, located } = await getCoords();
      const data = await api(`/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
      setWeather({ ...data, located });
      setFails(0);
    } catch {
      setFails((n) => n + 1);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  // Falhou (serviço do clima demorou, servidor reiniciando): tenta de novo em 30 s em vez de deixar
  // "Clima indisponível" na tela até a próxima atualização, 10 minutos depois
  useEffect(() => {
    if (!fails) return;
    const t = setTimeout(load, RETRY_MS);
    return () => clearTimeout(t);
  }, [fails, load]);

  return { weather, error: fails > 0 };
}
