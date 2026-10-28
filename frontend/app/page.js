'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { api, clearToken, getToken } from '@/lib/api';
import { countdownLabel, eventIcon } from '@/lib/format';
import { useToast } from '@/components/Toasts';
import PostIt from '@/components/PostIt';
import NoteModal from '@/components/NoteModal';
import AlertModal from '@/components/AlertModal';
import WeatherWidget from '@/components/WeatherWidget';
import WeatherBackground from '@/components/WeatherBackground';
import SettingsPanel from '@/components/SettingsPanel';
import FolderSwitcher from '@/components/FolderSwitcher';
import SearchPalette from '@/components/SearchPalette';
import { useWeather } from '@/lib/useWeather';
import { resolveScene } from '@/lib/scenes';

const ALERT_POLL_MS = 60 * 1000;

// Usado até o back responder (o back tem os mesmos padrões)
const DEFAULT_SETTINGS = {
  showWeather: true,
  showSeconds: true,
  clock24h: true,
  tempUnit: 'C',
  showUpcoming: true,
  dynamicBackground: false,
  backgroundMode: 'auto',
  effectsIntensity: 'medium',
  defaultColor: 'yellow',
  mobileLayout: 'grid',
  calmMode: false,
  autoCalmAfter: 0,
  warmFilter: 'off',
  bgDim: 0,
  softNotes: false,
};

const SESSION_KEY = 'mural_session_start';
const FOLDER_KEY = 'mural_folder';
const WARM_ALPHA = { off: 0, low: 0.14, high: 0.26 };

// Quando o usuário começou a usar o mural nesta aba (sobrevive a recarregar a página)
function sessionStart() {
  try {
    const saved = Number(sessionStorage.getItem(SESSION_KEY));
    if (saved) return saved;
    const now = Date.now();
    sessionStorage.setItem(SESSION_KEY, String(now));
    return now;
  } catch {
    return Date.now();
  }
}

// Ordem de leitura do mural do PC (de cima para baixo, da esquerda para a direita),
// usada para montar a grade do celular na mesma sequência
function readingOrder(a, b) {
  const rowA = Math.round(a.y / 180);
  const rowB = Math.round(b.y / 180);
  return rowA - rowB || a.x - b.x || a.id - b.id;
}

function useIsMobile() {
  const [mobile, setMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 720px)');
    const update = () => setMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return mobile;
}

function restartSession() {
  try {
    sessionStorage.setItem(SESSION_KEY, String(Date.now()));
  } catch {}
}

function notifyBrowser(note) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const title = note.eventType === 'birthday' ? '🎉 Aniversário hoje!' : '📌 Data importante hoje!';
  new Notification(title, { body: note.title });
}

export default function BoardPage() {
  const router = useRouter();
  const toast = useToast();
  const [user, setUser] = useState(null);
  const [notes, setNotes] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [upcoming, setUpcoming] = useState([]);
  const [modal, setModal] = useState({ open: false, note: null });
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [autoCalm, setAutoCalm] = useState(false);
  const savedSettings = useRef(DEFAULT_SETTINGS);
  const pendingPatch = useRef({});
  const saveTimer = useRef(null);
  const { weather, error: weatherError } = useWeather();
  const isMobile = useIsMobile();
  const [upcomingOpen, setUpcomingOpen] = useState(true);

  // No celular "Próximas datas" começa recolhido para não cobrir os post-its
  useEffect(() => setUpcomingOpen(!isMobile), [isMobile]);
  const notified = useRef(new Set());
  const today = useRef(null);
  const boardRef = useRef(null);

  // Pastas: null = Mural geral; undefined = ainda carregando
  const [folders, setFolders] = useState([]);
  const [rootCount, setRootCount] = useState(0);
  const [currentFolder, setCurrentFolder] = useState(undefined);
  const [notesLoaded, setNotesLoaded] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [foundId, setFoundId] = useState(null);
  const folderRef = useRef(undefined);
  const notesRef = useRef([]);
  const notesReq = useRef(0);
  const pendingFocus = useRef(null);
  const foundTimer = useRef(null);
  folderRef.current = currentFolder;
  notesRef.current = notes;

  const handleAuthError = useCallback(
    (err) => {
      if (err.status === 401) router.replace('/login');
      else toast(err.message, 'error');
    },
    [router, toast],
  );

  // Busca no back só os post-its da pasta aberta
  const loadNotes = useCallback(async (folder) => {
    const id = ++notesReq.current;
    const data = await api(`/notes?folder=${folder ?? 'root'}`);
    if (id === notesReq.current) {
      setNotes(data.notes);
      setNotesLoaded(true);
    }
  }, []);

  const loadFolders = useCallback(async () => {
    const data = await api('/folders');
    setFolders(data.folders);
    setRootCount(data.rootCount);
    return data.folders;
  }, []);

  const loadAlerts = useCallback(async () => {
    const data = await api('/alerts');
    setAlerts(data.alerts);
    setUpcoming(data.upcoming);
    data.alerts.forEach((n) => {
      if (!notified.current.has(n.id)) {
        notified.current.add(n.id);
        notifyBrowser(n);
      }
    });
    // Virou o dia? Recarrega as contagens dos post-its
    if (today.current && today.current !== data.today && folderRef.current !== undefined) loadNotes(folderRef.current);
    today.current = data.today;
  }, [loadNotes]);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const { user } = await api('/auth/me');
        setUser(user);
        const [list] = await Promise.all([
          loadFolders(),
          loadAlerts(),
          api('/settings').then((d) => {
            savedSettings.current = d.settings;
            setSettings(d.settings);
          }),
        ]);
        // Reabre a última pasta usada (se ainda existir)
        let saved = null;
        try {
          saved = Number(localStorage.getItem(FOLDER_KEY)) || null;
        } catch {}
        setCurrentFolder(list.some((f) => f.id === saved) ? saved : null);
      } catch (err) {
        handleAuthError(err);
      }
    })();
    const id = setInterval(() => loadAlerts().catch(() => {}), ALERT_POLL_MS);
    return () => clearInterval(id);
  }, [router, loadFolders, loadAlerts, handleAuthError]);

  // Trocou de pasta: limpa o mural e carrega os post-its dela
  useEffect(() => {
    if (currentFolder === undefined) return;
    try {
      localStorage.setItem(FOLDER_KEY, currentFolder ?? '');
    } catch {}
    setNotes([]);
    setNotesLoaded(false);
    if (!pendingFocus.current) boardRef.current?.scrollTo({ left: 0, top: 0 });
    loadNotes(currentFolder).catch((err) => {
      if (err.status === 404) setCurrentFolder(null);
      else handleAuthError(err);
    });
  }, [currentFolder, loadNotes, handleAuthError]);

  // Leva a tela até o post-it e faz ele brilhar
  // (funciona tanto no mural livre quanto na grade do celular)
  const focusNote = useCallback((id) => {
    const el = document.querySelector(`[data-note-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    setNotes((list) => {
      const maxZ = Math.max(0, ...list.map((x) => x.z));
      return list.map((x) => (x.id === id ? { ...x, z: maxZ + 1 } : x));
    });
    setFoundId(id);
    clearTimeout(foundTimer.current);
    foundTimer.current = setTimeout(() => setFoundId(null), 2800);
  }, []);

  // Veio da busca para outra pasta: espera os post-its chegarem e foca
  useEffect(() => {
    const id = pendingFocus.current;
    if (id && notes.some((n) => n.id === id)) {
      pendingFocus.current = null;
      setTimeout(() => focusNote(id), 450);
    }
  }, [notes, focusNote]);

  function handlePick(note) {
    setSearchOpen(false);
    const target = note.folderId ?? null;
    if (target !== currentFolder) {
      pendingFocus.current = note.id;
      setCurrentFolder(target);
    } else {
      focusNote(note.id);
    }
  }

  // Atalhos: Ctrl+K ou "/" abrem a busca
  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if (((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') || (e.key === '/' && !typing)) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  async function handleCreateFolder(data) {
    try {
      const res = await api('/folders', { method: 'POST', body: data });
      await loadFolders();
      toast(res.message, 'success');
      return res.folder;
    } catch (err) {
      handleAuthError(err);
      return null;
    }
  }

  async function handleRenameFolder(id, data) {
    try {
      const res = await api(`/folders/${id}`, { method: 'PUT', body: data });
      await loadFolders();
      toast(res.message, 'success');
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    }
  }

  async function handleDeleteFolder(id) {
    try {
      const res = await api(`/folders/${id}`, { method: 'DELETE' });
      await loadFolders();
      if (currentFolder === id) setCurrentFolder(null);
      else if (currentFolder === null) loadNotes(null);
      toast(res.message, 'info');
    } catch (err) {
      handleAuthError(err);
    }
  }

  const folderName = (id) => (id ? folders.find((f) => f.id === id)?.name : null) ?? 'Mural geral';

  // Spotlight que segue o mouse no fundo preto
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onMove = (e) => {
      el.style.setProperty('--mx', `${e.clientX}px`);
      el.style.setProperty('--my', `${e.clientY}px`);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const replaceNote = (note) => setNotes((list) => list.map((n) => (n.id === note.id ? note : n)));

  async function handleSave(form) {
    // Pede permissão de notificação na primeira vez que o usuário marca uma data
    if (form.eventDate && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    const targetFolder = form.folderId ?? null;
    try {
      if (modal.note) {
        const data = await api(`/notes/${modal.note.id}`, { method: 'PUT', body: form });
        if (targetFolder !== (modal.note.folderId ?? null)) {
          // Mudou de pasta: sai deste mural
          const moved = await api(`/notes/${modal.note.id}/folder`, { method: 'PATCH', body: { folderId: targetFolder } });
          setNotes((list) => list.filter((n) => n.id !== modal.note.id));
          loadFolders().catch(() => {});
          toast(moved.message, 'success');
        } else {
          replaceNote(data.note);
          toast(data.message, 'success');
        }
      } else {
        // Nasce numa área visível da tela (funciona no PC e no celular)
        const board = boardRef.current;
        const mobile = window.innerWidth <= 720;
        const noteW = mobile ? 180 : 240;
        const body = {
          ...form,
          x: (board?.scrollLeft ?? 0) + 16 + Math.random() * Math.max(10, window.innerWidth - noteW - 32),
          y: (board?.scrollTop ?? 0) + (mobile ? 150 : 110) + Math.random() * Math.max(40, window.innerHeight - 450),
        };
        const data = await api('/notes', { method: 'POST', body });
        if (targetFolder === currentFolder) {
          setNotes((list) => [...list, data.note]);
          toast(data.message, 'success');
        } else {
          toast(`Post-it criado na pasta "${folderName(targetFolder)}".`, 'success');
        }
        loadFolders().catch(() => {});
      }
      if (form.eventDate) loadAlerts().catch(() => {});
      return true;
    } catch (err) {
      handleAuthError(err);
      return false;
    }
  }

  async function handleMove(id, pos) {
    try {
      const data = await api(`/notes/${id}/position`, { method: 'PATCH', body: { ...pos, bringToFront: true } });
      replaceNote(data.note);
    } catch (err) {
      handleAuthError(err);
    }
  }

  function handleFocus(id) {
    setNotes((list) => {
      const maxZ = Math.max(0, ...list.map((n) => n.z));
      return list.map((n) => (n.id === id ? { ...n, z: maxZ + 1 } : n));
    });
  }

  async function handleDelete(id) {
    try {
      const data = await api(`/notes/${id}`, { method: 'DELETE' });
      setNotes((list) => list.filter((n) => n.id !== id));
      setAlerts((list) => list.filter((n) => n.id !== id));
      setUpcoming((list) => list.filter((n) => n.id !== id));
      loadFolders().catch(() => {});
      toast(data.message, 'info');
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function handleDismiss(id) {
    setAlerts((list) => list.filter((n) => n.id !== id));
    try {
      await api(`/alerts/${id}/dismiss`, { method: 'POST' });
    } catch (err) {
      handleAuthError(err);
    }
  }

  // Muda na tela na hora e manda para o back salvar (agrupando mudanças rápidas, ex.: o slider).
  // Se o back recusar, volta para o que estava salvo.
  function handleSettingsChange(patch) {
    setSettings((s) => ({ ...s, ...patch }));
    pendingPatch.current = { ...pendingPatch.current, ...patch };
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const body = pendingPatch.current;
      pendingPatch.current = {};
      try {
        const data = await api('/settings', { method: 'PUT', body });
        savedSettings.current = data.settings;
        if (Object.keys(pendingPatch.current).length === 0) setSettings(data.settings);
      } catch (err) {
        setSettings(savedSettings.current);
        handleAuthError(err);
      }
    }, 350);
  }

  // "Ligar sozinho após X min": conta o tempo de uso e ativa o modo confortável
  useEffect(() => {
    const minutes = settings.autoCalmAfter;
    if (!minutes || settings.calmMode) {
      setAutoCalm(false);
      return;
    }
    const check = () => {
      if (Date.now() - sessionStart() >= minutes * 60_000) setAutoCalm(true);
    };
    check();
    const id = setInterval(check, 30_000);
    return () => clearInterval(id);
  }, [settings.autoCalmAfter, settings.calmMode]);

  const prevAutoCalm = useRef(false);
  useEffect(() => {
    if (autoCalm && !prevAutoCalm.current) {
      toast('Você já está um tempinho no mural: ativamos o modo confortável para descansar a vista 🌙', 'info');
    }
    prevAutoCalm.current = autoCalm;
  }, [autoCalm, toast]);

  // "Desligar por agora": zera a contagem de tempo de uso
  function handleSnoozeAutoCalm() {
    restartSession();
    setAutoCalm(false);
  }

  async function handleSaveName(name) {
    try {
      const data = await api('/profile', { method: 'PUT', body: { name } });
      setUser(data.user);
      toast(data.message, 'success');
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function handleLogout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {}
    clearToken();
    router.replace('/login');
  }

  const openNew = () => setModal({ open: true, note: null });
  const openEdit = (note) => setModal({ open: true, note });
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // No celular, por padrão, os post-its viram uma grade que cabe na tela (sem rolar para o lado)
  const gridMode = isMobile && settings.mobileLayout !== 'free';
  const shownNotes = gridMode ? [...notes].sort(readingOrder) : notes;
  const canvasW = Math.max(0, ...notes.map((n) => n.x + 320));
  const canvasH = Math.max(0, ...notes.map((n) => n.y + 320));
  const canvasStyle = gridMode ? undefined : { width: `max(100%, ${canvasW}px)`, height: `max(100%, ${canvasH}px)` };

  const scene = resolveScene(settings, weather);
  const isDay = weather?.isDay ?? true;
  const calm = settings.calmMode || autoCalm;
  const boardClass = [
    'board',
    scene && `has-scene scene-${scene}`,
    calm && 'calm',
    settings.softNotes && 'soft-notes',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <main className={boardClass} ref={boardRef}>
      {!scene && <div className="stars" />}
      <WeatherBackground scene={scene} isDay={isDay} intensity={settings.effectsIntensity} calm={calm} />
      <div className="bg-dim" style={{ opacity: settings.bgDim / 100 }} />
      {!calm && <div className="spotlight" />}
      <div className="warm-filter" style={{ opacity: WARM_ALPHA[settings.warmFilter] ?? 0 }} />

      <header className="topbar">
        <motion.div className="brand" initial={{ opacity: 0, x: -30 }} animate={{ opacity: 1, x: 0 }}>
          <span className="brand-pin">📌</span>
          <div className="brand-text">
            <strong>Mural de Notas</strong>
            <small>{user ? `${notes.length} post-it${notes.length === 1 ? '' : 's'} aqui` : 'carregando...'}</small>
          </div>
        </motion.div>
        {currentFolder !== undefined && (
          <FolderSwitcher
            folders={folders}
            rootCount={rootCount}
            current={currentFolder}
            onSelect={setCurrentFolder}
            onCreate={handleCreateFolder}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
          />
        )}
        <motion.button
          className="gear-btn search-btn"
          onClick={() => setSearchOpen(true)}
          aria-label="Pesquisar post-its"
          title="Pesquisar (Ctrl + K)"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
        >
          <svg viewBox="0 0 24 24" width="21" height="21" aria-hidden>
            <path
              fill="currentColor"
              d="M10.5 3a7.5 7.5 0 0 1 5.96 12.05l4.25 4.24-1.42 1.42-4.24-4.25A7.5 7.5 0 1 1 10.5 3zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z"
            />
          </svg>
        </motion.button>
        <motion.button
          className="gear-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Configurações"
          title="Configurações"
          whileHover={{ rotate: 90, scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15 }}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <path
              fill="currentColor"
              d="M19.14 12.94a7.07 7.07 0 0 0 0-1.88l2.03-1.58a.5.5 0 0 0 .12-.64l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7 7 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.49.42l-.36 2.54a7.3 7.3 0 0 0-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.66 8.84a.5.5 0 0 0 .12.64l2.03 1.58a7.07 7.07 0 0 0 0 1.88l-2.03 1.58a.5.5 0 0 0-.12.64l1.92 3.32c.13.22.39.3.6.22l2.39-.96c.5.38 1.05.7 1.63.94l.36 2.54c.04.24.25.42.49.42h3.84c.25 0 .45-.18.5-.42l.36-2.54a7 7 0 0 0 1.63-.94l2.39.96c.22.08.47 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.64l-2.03-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"
            />
          </svg>
        </motion.button>
      </header>

      <AnimatePresence>
        {settings.showWeather && (
          <WeatherWidget
            key="weather"
            weather={weather}
            error={weatherError}
            userName={user?.name}
            settings={settings}
          />
        )}
      </AnimatePresence>

      {/* Cada pasta é um mural: ao trocar, o mural desliza para o lado e os post-its da nova caem */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${currentFolder}-${gridMode ? 'grid' : 'free'}`}
          className={`canvas ${gridMode ? 'canvas-grid' : ''} ${settings.showWeather ? 'with-weather' : ''}`}
          style={canvasStyle}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.25 }}
        >
          <AnimatePresence>
            {shownNotes.map((note, i) => (
              <PostIt
                key={note.id}
                note={note}
                grid={gridMode}
                index={i}
                calm={calm}
                found={foundId === note.id}
                onMove={handleMove}
                onEdit={openEdit}
                onDelete={handleDelete}
                onFocus={handleFocus}
              />
            ))}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {user && notesLoaded && notes.length === 0 && currentFolder !== null && (
          <motion.div
            className="empty"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <motion.div className="empty-emoji" animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 3 }}>
              {folders.find((f) => f.id === currentFolder)?.icon ?? '📁'}
            </motion.div>
            <h2>A pasta “{folderName(currentFolder)}” está vazia</h2>
            <p>Clique no + para colar um post-it aqui.</p>
          </motion.div>
        )}
        {user && notesLoaded && notes.length === 0 && currentFolder === null && (
          <motion.div
            className="empty"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
          >
            <motion.div
              className="empty-emoji"
              animate={{ rotate: [0, -8, 8, 0], y: [0, -10, 0] }}
              transition={{ repeat: Infinity, duration: 3 }}
            >
              🗒️
            </motion.div>
            <h2>Seu mural está vazio</h2>
            <p>Clique no botão + para colar seu primeiro post-it.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {settings.showUpcoming && upcoming.length > 0 && (
        <motion.aside
          layout
          className={`upcoming ${upcomingOpen ? '' : 'collapsed'}`}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button type="button" className="upcoming-head" onClick={() => setUpcomingOpen((o) => !o)} aria-expanded={upcomingOpen}>
            <h4>
              {upcomingOpen ? 'Próximas datas' : `📅 ${upcoming.length} data${upcoming.length === 1 ? '' : 's'} chegando`}
            </h4>
            <motion.span className="chevron" animate={{ rotate: upcomingOpen ? 0 : 180 }}>
              ▾
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {upcomingOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}>
                {upcoming.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="upcoming-item"
                    onClick={() => {
                      if (isMobile) setUpcomingOpen(false);
                      handlePick(n);
                    }}
                    title="Ir até o post-it"
                  >
                    <span>
                      {eventIcon(n.eventType)} {n.title}
                    </span>
                    <em>{countdownLabel(n)}</em>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.aside>
      )}

      <motion.button
        className="fab"
        onClick={openNew}
        aria-label="Novo post-it"
        initial={{ scale: 0, rotate: -180 }}
        animate={{ scale: 1, rotate: 0 }}
        whileHover={{ scale: 1.12, rotate: 90 }}
        whileTap={{ scale: 0.9 }}
        transition={{ type: 'spring', stiffness: 260, damping: 15 }}
      >
        +
      </motion.button>

      <NoteModal
        open={modal.open}
        note={modal.note}
        defaultColor={settings.defaultColor}
        folders={folders}
        currentFolder={currentFolder ?? null}
        onClose={closeModal}
        onSave={handleSave}
      />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} onPick={handlePick} />
      <SettingsPanel
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings}
        onChange={handleSettingsChange}
        user={user}
        onSaveName={handleSaveName}
        onLogout={handleLogout}
        weather={weather}
        autoCalm={autoCalm}
        onSnoozeAutoCalm={handleSnoozeAutoCalm}
      />
      <AlertModal alerts={alerts} onDismiss={handleDismiss} calm={calm} />
    </main>
  );
}
