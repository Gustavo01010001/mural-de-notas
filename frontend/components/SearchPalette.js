'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/api';
import { highlight, snippet } from '@/lib/highlight';
import { COLORS, countdownLabel, eventIcon } from '@/lib/format';
import { tagColor } from '@/lib/noteHelpers';
import Icon from './Icon';

const RECENT_KEY = 'mural_recent_searches';
const EMPTY_FILTERS = { color: null, folder: undefined, tag: null, hasDate: false };

const Marked = ({ segments }) => segments.map((s, i) => (s.match ? <mark key={i}>{s.text}</mark> : <span key={i}>{s.text}</span>));

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function saveRecent(q) {
  try {
    const list = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {}
}

// Busca por palavras, datas ("outubro", "25/12", "hoje") e filtros. Quem procura é o back.
export default function SearchPalette({ open, onClose, onPick, folders = [] }) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [results, setResults] = useState([]);
  const [dateLabel, setDateLabel] = useState(null);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const [tags, setTags] = useState([]);
  const [recent, setRecent] = useState([]);
  const [showFilters, setShowFilters] = useState(false);
  const reqId = useRef(0);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setActive(0);
    setRecent(readRecent());
    api('/notes/tags')
      .then((d) => setTags(d.tags))
      .catch(() => {});
  }, [open]);

  const activeFilters = (filters.color ? 1 : 0) + (filters.folder !== undefined ? 1 : 0) + (filters.tag ? 1 : 0) + (filters.hasDate ? 1 : 0);

  useEffect(() => {
    const q = query.trim();
    if (!q && !activeFilters) {
      setResults([]);
      setDateLabel(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++reqId.current;
    const t = setTimeout(async () => {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (filters.color) params.set('color', filters.color);
      if (filters.folder !== undefined) params.set('folder', filters.folder === null ? 'root' : String(filters.folder));
      if (filters.tag) params.set('tag', filters.tag);
      if (filters.hasDate) params.set('hasDate', '1');
      try {
        const data = await api(`/notes/search?${params}`);
        if (id === reqId.current) {
          setResults(data.results);
          setDateLabel(data.dateLabel);
          setActive(0);
        }
      } catch {
        if (id === reqId.current) setResults([]);
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [query, filters, activeFilters]);

  useEffect(() => {
    listRef.current?.querySelector('.search-item.active')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(note) {
    if (query.trim().length >= 2) saveRecent(query.trim());
    onPick(note);
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === 'Enter' && results[active]) {
      pick(results[active]);
    }
  }

  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  const q = query.trim();
  const idle = !q && !activeFilters;

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="search-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
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
                <path fill="currentColor" d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z" />
              </svg>
              <input
                ref={inputRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pesquisar... (ex: reunião, outubro, 25/12)"
                maxLength={100}
              />
              <button
                type="button"
                className={`search-filter-toggle ${showFilters || activeFilters ? 'on' : ''}`}
                onClick={() => setShowFilters((s) => !s)}
                aria-expanded={showFilters}
                title="Filtros"
              >
                <Icon name="sliders" size={15} /> Filtros{activeFilters ? ` (${activeFilters})` : ''}
              </button>
              {loading ? <span className="search-spinner" /> : <kbd>Esc</kbd>}
            </div>

            <AnimatePresence initial={false}>
              {showFilters && (
                <motion.div className="search-filters" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                  <div className="sf-row">
                    <span>Cor</span>
                    {COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className={`color-dot small dot-${c.id} ${filters.color === c.id ? 'selected light' : ''}`}
                        onClick={() => set({ color: filters.color === c.id ? null : c.id })}
                        aria-label={c.label}
                        aria-pressed={filters.color === c.id}
                      />
                    ))}
                  </div>
                  <div className="sf-row">
                    <span>Pasta</span>
                    <select value={filters.folder === undefined ? '' : filters.folder === null ? 'root' : filters.folder} onChange={(e) => set({ folder: e.target.value === '' ? undefined : e.target.value === 'root' ? null : Number(e.target.value) })}>
                      <option value="">Todas</option>
                      <option value="root">📌 Mural geral</option>
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {'  '.repeat((f.depth ?? 1) - 1)}
                          {(f.depth ?? 1) > 1 ? '└ ' : ''}
                          {f.icon} {f.name}
                          {f.ownerName ? ` (de ${f.ownerName})` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  {tags.length > 0 && (
                    <div className="sf-row sf-tags">
                      <span>Etiqueta</span>
                      {tags.slice(0, 12).map(({ tag }) => (
                        <button
                          key={tag}
                          type="button"
                          className={`sf-tag ${filters.tag === tag ? 'on' : ''}`}
                          style={{ '--tc': tagColor(tag) }}
                          onClick={() => set({ tag: filters.tag === tag ? null : tag })}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="sf-row">
                    <label className="sf-check">
                      <input type="checkbox" checked={filters.hasDate} onChange={(e) => set({ hasDate: e.target.checked })} />
                      <Icon name="calendar" size={14} /> Só os que têm data
                    </label>
                    {activeFilters > 0 && (
                      <button type="button" className="btn-text" onClick={() => setFilters(EMPTY_FILTERS)}>
                        Limpar filtros
                      </button>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="search-results" ref={listRef}>
              {idle && (
                <>
                  {recent.length > 0 && (
                    <div className="search-recent">
                      <span>Buscas recentes</span>
                      {recent.map((r) => (
                        <button key={r} type="button" onClick={() => (setQuery(r), inputRef.current?.focus())}>
                          <Icon name="clock" size={13} /> {r}
                        </button>
                      ))}
                      <button
                        type="button"
                        className="btn-text"
                        onClick={() => {
                          try {
                            localStorage.removeItem(RECENT_KEY);
                          } catch {}
                          setRecent([]);
                        }}
                      >
                        limpar
                      </button>
                    </div>
                  )}
                  <p className="search-hint">
                    Procure em <b>todas as pastas</b>, sem ligar para acentos. Também entende datas:
                    <br />
                    {['outubro', 'dezembro 2026', '25/12', 'hoje', 'amanhã', '#urgente'].map((ex) => (
                      <button key={ex} type="button" className="search-example" onClick={() => setQuery(ex)}>
                        {ex}
                      </button>
                    ))}
                    <br />
                    <span>Atalho: Ctrl + K ou /</span>
                  </p>
                </>
              )}
              {dateLabel && !loading && (
                <p className="search-date-label">
                  📅 Com data em <b>{dateLabel}</b>
                </p>
              )}
              {!idle && !loading && results.length === 0 && <p className="search-hint">Nada encontrado 🤔</p>}

              {results.map((n, i) => (
                <motion.button
                  key={n.id}
                  type="button"
                  className={`search-item ${i === active ? 'active' : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(n)}
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
                      {n.status === 'archived' ? '📦 Arquivado' : `${n.folderIcon} ${n.folderName}`}
                      {n.sharedBy ? ` · de ${n.sharedBy}` : ''}
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
