'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Clock, { greeting } from './Clock';
import WeatherIcon from './WeatherIcon';

const toUnit = (c, unit) => (c == null ? null : unit === 'F' ? (c * 9) / 5 + 32 : c);

export default function WeatherWidget({ weather, error, userName, settings }) {
  const [open, setOpen] = useState(true);
  const [hour, setHour] = useState(null);

  // No celular começa compacto para não cobrir os post-its
  useEffect(() => {
    if (window.matchMedia('(max-width: 720px)').matches) setOpen(false);
  }, []);

  const unit = settings.tempUnit;
  const round = (c) => {
    const v = toUnit(c, unit);
    return v == null ? '--' : Math.round(v);
  };
  const theme = weather ? `${weather.condition}-${weather.isDay ? 'day' : 'night'}` : 'loading';
  const clockProps = { timeZone: weather?.timeZone, showSeconds: settings.showSeconds, hour12: !settings.clock24h };

  return (
    <motion.aside
      className={`weather weather-${theme} ${open ? '' : 'collapsed'}`}
      initial={{ opacity: 0, x: 60, y: -20 }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ type: 'spring', stiffness: 120, damping: 16 }}
      layout
    >
      <button className="weather-toggle" onClick={() => setOpen((o) => !o)} aria-label={open ? 'Recolher clima' : 'Expandir clima'}>
        {open ? '–' : '+'}
      </button>

      <div className="weather-top" onClick={() => !open && setOpen(true)}>
        <motion.div
          className="weather-icon"
          animate={{ y: [0, -5, 0] }}
          transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
        >
          {weather ? <WeatherIcon condition={weather.condition} isDay={weather.isDay} /> : <div className="wx-loading" />}
        </motion.div>
        <div className="weather-main">
          <div className="weather-temp">
            {weather ? round(weather.temperature) : '--'}
            <span>°{unit}</span>
          </div>
          <div className="weather-desc">{error ? 'Clima indisponível' : weather?.description ?? 'Carregando...'}</div>
        </div>
        {!open && <Clock {...clockProps} compact />}
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="weather-more"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <Clock {...clockProps} onHour={setHour} />
            {hour != null && userName && (
              <div className="weather-greeting">
                {greeting(hour)}, {userName.split(' ')[0]}!
              </div>
            )}
            {weather && (
              <div className="weather-stats">
                <span title="Localização">📍 {weather.city ?? 'Sua região'}</span>
                <span title="Mín / Máx">
                  ⬇ {round(weather.min)}° ⬆ {round(weather.max)}°
                </span>
                <span title="Sensação térmica">🌡 {round(weather.feelsLike)}°</span>
                <span title="Umidade">💧 {weather.humidity == null ? '--' : Math.round(weather.humidity)}%</span>
                <span title="Vento">💨 {weather.wind == null ? '--' : Math.round(weather.wind)} km/h</span>
              </div>
            )}
            {weather && (
              <div className="weather-source">fonte: {weather.source === 'google' ? 'Google Weather' : 'Open-Meteo'}</div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}
