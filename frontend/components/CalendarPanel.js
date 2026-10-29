'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';
import { eventIcon, googleCalendarUrl, repeatLabel } from '@/lib/format';

const WEEK = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const pad = (n) => String(n).padStart(2, '0');

function shiftMonth(month, delta) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

// Calendário do mês: em quais dias há post-its com data (contando repetições)
export default function CalendarPanel({ open, onClose, onPick, onAuthError }) {
  const [month, setMonth] = useState(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState(null);
  const [dir, setDir] = useState(0);

  const load = useCallback(
    async (m) => {
      try {
        const res = await api(`/calendar${m ? `?month=${m}` : ''}`);
        setData(res);
        setMonth(res.month);
        return res;
      } catch (err) {
        onAuthError(err);
      }
    },
    [onAuthError],
  );

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    load(null).then((res) => res && setSelected(res.today));
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, load, onClose]);

  function go(delta) {
    setDir(delta);
    setSelected(null);
    load(shiftMonth(month, delta));
  }

  if (!open) return null;
  const [y, m] = (month ?? '2026-01').split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const total = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const cells = [...Array(firstWeekday).fill(null), ...Array.from({ length: total }, (_, i) => `${month}-${pad(i + 1)}`)];
  const dayList = selected ? data?.days?.[selected] ?? [] : [];

  return (
    <AnimatePresence>
      <motion.div className="modal-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
        <motion.div
          className="calendar-panel"
          role="dialog"
          aria-label="Calendário"
          initial={{ y: 30, opacity: 0, scale: 0.96 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 28 }}
        >
          <header className="calendar-head">
            <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Mês anterior">
              ‹
            </button>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.h2 key={month} initial={{ x: dir * 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -dir * 30, opacity: 0 }}>
                📅 {MONTHS[m - 1]} {y}
              </motion.h2>
            </AnimatePresence>
            <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Próximo mês">
              ›
            </button>
            {data && month !== data.today.slice(0, 7) && (
              <button type="button" className="btn-ghost-light small" onClick={() => load(null).then((r) => r && setSelected(r.today))}>
                Hoje
              </button>
            )}
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Fechar">
              ✕
            </button>
          </header>

          <div className="calendar-grid" role="grid">
            {WEEK.map((d, i) => (
              <span key={i} className="calendar-weekday">
                {d}
              </span>
            ))}
            {cells.map((date, i) => {
              if (!date) return <span key={`e${i}`} />;
              const items = data?.days?.[date] ?? [];
              return (
                <motion.button
                  key={date}
                  type="button"
                  role="gridcell"
                  className={`calendar-day ${date === data?.today ? 'today' : ''} ${date === selected ? 'selected' : ''} ${items.length ? 'has' : ''}`}
                  onClick={() => setSelected(date)}
                  whileTap={{ scale: 0.92 }}
                  aria-label={`${Number(date.slice(8))}${items.length ? `, ${items.length} post-it(s)` : ''}`}
                >
                  <span className="calendar-num">{Number(date.slice(8))}</span>
                  <span className="calendar-dots">
                    {items.slice(0, 4).map((it) => (
                      <i key={it.id} className={`dot-${it.color}`} />
                    ))}
                  </span>
                </motion.button>
              );
            })}
          </div>

          <div className="calendar-list">
            {selected && (
              <h3>
                {Number(selected.slice(8))}/{selected.slice(5, 7)} {selected === data?.today && '· hoje'}
              </h3>
            )}
            {selected && dayList.length === 0 && <p className="trash-empty">Nada marcado neste dia.</p>}
            {dayList.map((it) => (
              <div key={it.id} className={`calendar-item postit-${it.color}`}>
                <button type="button" className="calendar-item-main" onClick={() => onPick(it)}>
                  <strong>
                    {eventIcon(it.eventType)} {it.title}
                    {it.years ? ` · ${it.years} anos` : ''}
                  </strong>
                  <small>
                    {it.eventTime ? `às ${it.eventTime} · ` : ''}
                    {it.repeat !== 'none' ? `🔁 ${repeatLabel({ ...it, eventDate: selected })} · ` : ''}
                    {it.folderIcon} {it.folderName}
                  </small>
                </button>
                <a
                  className="btn-ghost small"
                  href={googleCalendarUrl({ ...it, eventDate: selected, nextDate: selected })}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Adicionar ao Google Agenda"
                >
                  + Google
                </a>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
