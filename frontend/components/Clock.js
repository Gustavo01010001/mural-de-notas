'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

function parts(date, { timeZone, showSeconds, hour12 }) {
  const opts = timeZone ? { timeZone } : {};
  const time = date.toLocaleTimeString('pt-BR', {
    ...opts,
    hour: '2-digit',
    minute: '2-digit',
    ...(showSeconds ? { second: '2-digit' } : {}),
    hour12,
  });
  const longDay = date.toLocaleDateString('pt-BR', { ...opts, weekday: 'long', day: 'numeric', month: 'long' });
  const day = longDay.charAt(0).toUpperCase() + longDay.slice(1);
  const hour = Number(date.toLocaleTimeString('en-GB', { ...opts, hour: '2-digit', hour12: false }));
  return { time, day, hour };
}

export function greeting(hour) {
  if (hour < 5) return 'Boa madrugada';
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// Relógio com cada dígito "virando" quando muda
export default function Clock({ timeZone, showSeconds = true, hour12 = false, compact = false, onHour }) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const p = now ? parts(now, { timeZone, showSeconds: showSeconds && !compact, hour12 }) : null;

  useEffect(() => {
    if (p) onHour?.(p.hour);
  }, [p?.hour, onHour]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!p) return <div className={compact ? 'clock-compact' : 'clock clock-skeleton'} />;
  if (compact) return <div className="clock-compact">{p.time}</div>;

  return (
    <div className="clock">
      <div className="clock-time" aria-label={p.time}>
        {p.time.split('').map((ch, i) => (
          <span key={i} className={/\d/.test(ch) ? 'clock-digit' : ch === ':' ? 'clock-sep colon' : 'clock-sep'}>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={ch}
                initial={{ y: -22, opacity: 0, rotateX: 90 }}
                animate={{ y: 0, opacity: 1, rotateX: 0 }}
                exit={{ y: 22, opacity: 0, rotateX: -90 }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
              >
                {ch === ' ' || ch === ' ' ? ' ' : ch}
              </motion.span>
            </AnimatePresence>
          </span>
        ))}
      </div>
      <div className="clock-date">{p.day}</div>
    </div>
  );
}
