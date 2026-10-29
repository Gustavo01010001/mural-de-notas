'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const ToastContext = createContext(() => {});

export const useToast = () => useContext(ToastContext);

/**
 * toast(mensagem, tipo, { action: { label, onClick }, duration })
 * Com "action" o aviso ganha um botão (ex.: Desfazer) e uma barrinha mostrando o tempo que falta.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const close = useCallback((id) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message, type = 'info', opts = {}) => {
      const id = crypto.randomUUID();
      const duration = opts.duration ?? (opts.action ? 7000 : 3500);
      setToasts((t) => [...t.slice(-3), { id, message, type, action: opts.action, duration }]);
      timers.current.set(
        id,
        setTimeout(() => close(id), duration),
      );
      return id;
    },
    [close],
  );

  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              layout
              className={`toast toast-${t.type} ${t.action ? 'has-action' : ''}`}
              initial={{ opacity: 0, y: 30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, x: 80 }}
            >
              <span>
                {{ success: '✅', error: '⚠️', trash: '🗑️', move: '📁', archive: '📦' }[t.type] ?? '💬'} {t.message}
              </span>
              {t.action && (
                <button
                  type="button"
                  className="toast-action"
                  onClick={() => {
                    close(t.id);
                    t.action.onClick();
                  }}
                >
                  {t.action.label}
                </button>
              )}
              {t.action && <span className="toast-timer" style={{ animationDuration: `${t.duration}ms` }} />}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
