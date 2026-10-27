'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';
import { highlight, snippet } from '@/lib/highlight';
import { countdownLabel, eventIcon } from '@/lib/format';

const Marked = ({ segments }) =>
  segments.map((s, i) => (s.match ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>));

// Busca por palavras-chave em todos os post-its (de todas as pastas). Quem procura é o back.
export default function SearchPalette({ open, onClose, onPick }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const reqId = useRef(0);
  const listRef = useRef(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setResults([]);
      setActive(0);
    }
  }, [open]);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      try {
        const data = await api(`/notes/search?q=${encodeURIComponent(q)}`);
        if (id === reqId.current) {
          setResults(data.results);
          setActive(0);
        }
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    listRef.current?.querySelector('.search-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function onKeyDown(e) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      onPick(results[active]);
    }
  }

  const q = query.trim();

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="search-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onMouseDown={(e) => e.target === e.currentTarget && onClose()}
        >
          <motion.div
            className="search-panel"
            role="dialog"
            aria-label="Pesquisar post-its"
            initial={{ y: -24, opacity: 0, scale: 0.97 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -16, opacity: 0, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 380, damping: 30 }}
          >
            <div className="search-input">
              <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden>
                <path
                  fill="currentColor"
                  d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"
                />
              </svg>
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pesquisar em todos os post-its..."
                maxLength={100}
              />
              {loading ? <span className="search-spinner" /> : <kbd>Esc</kbd>}
            </div>

            <div className="search-results" ref={listRef}>
              {!q && (
                <p className="search-hint">
                  Digite palavras do título ou do texto. Procura em <b>todas as pastas</b>, sem ligar para acentos.
                  <br />
                  <span>Atalho: Ctrl + K ou /</span>
                </p>
              )}
              {q && !loading && results.length === 0 && <p className="search-hint">Nada encontrado para “{q}” 🤔</p>}

              {results.map((n, i) => (
                <motion.button
                  key={n.id}
                  type="button"
                  className={`search-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => onPick(n)}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i, 8) * 0.025 }}
                >
                  <span className={`search-swatch dot-${n.color}`} />
                  <span className="search-text">
                    <strong>
                      <Marked segments={highlight(n.title, q)} />
                    </strong>
                    {n.content && (
                      <small>
                        <Marked segments={snippet(n.content, q)} />
                      </small>
                    )}
                  </span>
                  <span className="search-meta">
                    <span className="search-folder">
                      {n.folderIcon} {n.folderName}
                    </span>
                    {n.eventDate && (
                      <span className="search-date">
                        {eventIcon(n.eventType)} {countdownLabel(n)}
                      </span>
                    )}
                  </span>
                </motion.button>
              ))}
            </div>

            {results.length > 0 && (
              <footer className="search-foot">
                {results.length} resultado{results.length === 1 ? '' : 's'} · ↑↓ para navegar · Enter para abrir
              </footer>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
