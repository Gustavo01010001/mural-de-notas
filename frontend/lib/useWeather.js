'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const FALLBACK = { lat: -23.55, lon: -46.63 }; // São Paulo, se o usuário negar a localização
const REFRESH_MS = 10 * 60 * 1000;

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
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const { lat, lon, located } = await getCoords();
      const data = await api(`/weather?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`);
      setWeather({ ...data, located });
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  return { weather, error };
}
