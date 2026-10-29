'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Confetti from './Confetti';
import { alertHeadline, eventIcon } from '@/lib/format';

export default function AlertModal({ alerts, onDismiss, calm = false }) {
  const current = alerts[0];

  return (
    <AnimatePresence>
      {current && (
        <motion.div
          className="modal-backdrop alert-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          {current.eventType === 'birthday' && current.alertStage !== 'soon' && <Confetti count={calm ? 25 : 90} />}

          <motion.div
            key={`${current.id}-${current.alertKey}`}
            className={`alert-card postit-${current.color}`}
            role="alertdialog"
            aria-labelledby="alert-title"
            initial={{ scale: 0.2, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: [0, -3, 3, -2, 0], opacity: 1 }}
            exit={{ scale: 0.4, y: 200, opacity: 0 }}
            transition={{
              type: 'spring',
              stiffness: 220,
              damping: 14,
              rotate: { duration: 0.9, ease: 'easeInOut' },
            }}
          >
            <span className="postit-tape" />
            <motion.div
              className="alert-emoji"
              animate={{ y: [0, -14, 0], rotate: [0, -10, 10, 0] }}
              transition={{ repeat: Infinity, duration: 1.6 }}
            >
              {current.alertStage === 'soon' ? '🔔' : current.eventType === 'birthday' ? '🎉' : eventIcon(current.eventType)}
            </motion.div>

            <p className="alert-kicker">{alertHeadline(current)}</p>
            <h2 id="alert-title">{current.title}</h2>
            {current.years && current.eventType === 'birthday' && (
              <p className="alert-years">Completando {current.years} anos 🎂</p>
            )}
            {current.content && <p className="alert-content">{current.content}</p>}

            <motion.button
              className="btn-dark"
              onClick={() => onDismiss(current)}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              autoFocus
            >
              {current.alertStage === 'soon' ? 'Ok, me lembro!' : current.eventType === 'birthday' ? 'Vou dar os parabéns! 🥳' : 'Ok, entendi!'}
            </motion.button>
            {alerts.length > 1 && <small>+{alerts.length - 1} alerta(s) hoje</small>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
