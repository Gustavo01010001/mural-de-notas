'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AnimatePresence, motion } from 'framer-motion';
import { api, clearSession, hasSession, migrateLegacyToken } from '@/lib/api';
import { alertHeadline, countdownLabel, eventIcon } from '@/lib/format';
import { tagColor } from '@/lib/noteHelpers';
import { useToast } from '@/components/Toasts';
import PostIt from '@/components/PostIt';
import NoteModal from '@/components/NoteModal';
import AlertModal from '@/components/AlertModal';
import WeatherWidget from '@/components/WeatherWidget';
import WeatherBackground from '@/components/WeatherBackground';
import SettingsPanel from '@/components/SettingsPanel';
import FolderSwitcher from '@/components/FolderSwitcher';
import SearchPalette from '@/components/SearchPalette';
import TrashPanel from '@/components/TrashPanel';
import ShareModal from '@/components/ShareModal';
import CalendarPanel from '@/components/CalendarPanel';
import { FolderDropDock, LiveCursors, PresenceBar } from '@/components/LiveLayer';
import { useLiveFolder } from '@/lib/useLiveFolder';
import { flattenTree } from '@/lib/folderTree';
import { BoardTools, SelectionBar, ZOOM_MAX, ZOOM_MIN } from '@/components/BoardTools';
import { useWeather } from '@/lib/useWeather';
import { applyAppearance } from '@/lib/appearance';
import { playSound, setSoundPrefs } from '@/lib/sounds';
import FocusTimer from '@/components/FocusTimer';
import Icon from '@/components/Icon';
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
  theme: 'dark',
  fontScale: 1,
  highContrast: false,
  sounds: false,
  soundVolume: 0.6,
  showFocusTimer: false,
  focusMinutes: 25,
  breakMinutes: 5,
  calmMode: false,
  autoCalmAfter: 0,
  warmFilter: 'off',
  bgDim: 0,
  softNotes: false,
};

const SESSION_KEY = 'mural_session_start';
const FOLDER_KEY = 'mural_folder';
const ZOOM_KEY = 'mural_zoom';
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
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1; // fixados sempre primeiro
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
  const title =
    note.alertStage === 'soon'
      ? `🔔 ${alertHeadline(note)}`
      : note.eventType === 'birthday'
        ? '🎉 Aniversário hoje!'
        : note.eventTime
          ? `⏰ Agora: ${note.eventTime}`
          : '📌 Data importante hoje!';
  new Notification(title, { body: note.title, tag: `${note.id}-${note.alertKey}` });
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
  const [sharedFolders, setSharedFolders] = useState([]); // compartilhadas comigo
  const [shareFolder, setShareFolder] = useState(null); // pasta aberta na janela "compartilhar"
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [dragNote, setDragNote] = useState(null); // post-it sendo arrastado (mostra a faixa de pastas)
  const [dropHover, setDropHover] = useState(null);
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

  // Lixeira/arquivados, filtro por etiqueta, seleção múltipla, zoom e "arrumar"
  const [special, setSpecial] = useState({ archived: 0, trash: 0 });
  const [specialPanel, setSpecialPanel] = useState(null); // 'trash' | 'archive' | null
  const [tagFilter, setTagFilter] = useState(null);
  const [selection, setSelection] = useState(null); // null = fora do modo seleção; Set de ids
  const [zoom, setZoomState] = useState(1);
  const [arranging, setArranging] = useState(false);
  const lastUndo = useRef(null); // para o Ctrl+Z

  useEffect(() => {
    try {
      const z = Number(localStorage.getItem(ZOOM_KEY));
      if (z >= ZOOM_MIN && z <= ZOOM_MAX) setZoomState(z);
    } catch {}
  }, []);

  const setZoom = useCallback((z) => {
    const value = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) * 10) / 10;
    setZoomState(value);
    try {
      localStorage.setItem(ZOOM_KEY, String(value));
    } catch {}
  }, []);

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
    setSharedFolders(data.shared ?? []);
    setRootCount(data.rootCount);
    setSpecial({ archived: data.archivedCount ?? 0, trash: data.trashCount ?? 0 });
    return [...data.folders, ...(data.shared ?? [])];
  }, []);

  const loadAlerts = useCallback(async () => {
    const data = await api('/alerts');
    setAlerts(data.alerts);
    setUpcoming(data.upcoming);
    // cada aviso ("1 dia antes", "na hora") notifica uma vez
    data.alerts.forEach((n) => {
      const key = `${n.id}:${n.alertKey}`;
      if (!notified.current.has(key)) {
        notified.current.add(key);
        notifyBrowser(n);
        playSound('alert');
      }
    });
    // Virou o dia? Recarrega as contagens dos post-its
    if (today.current && today.current !== data.today && folderRef.current !== undefined) loadNotes(folderRef.current);
    today.current = data.today;
  }, [loadNotes]);

  useEffect(() => {
    if (!hasSession()) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        await migrateLegacyToken(); // login antigo (token no navegador) vira cookie seguro
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
    setSelection(null);
    setTagFilter(null);
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
    if (note.status === 'archived') {
      setSpecialPanel('archive');
      return;
    }
    setTagFilter(null);
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

  const folderName = (id) => (id ? [...folders, ...sharedFolders].find((f) => f.id === id)?.name : null) ?? 'Mural geral';

  // Arrastar a alça ⠿ no seletor de pastas muda a ordem
  async function handleReorderFolders(parentId, ids) {
    setFolders((list) => list.map((f) => ((f.parentId ?? null) === parentId && ids.includes(f.id) ? { ...f, position: ids.indexOf(f.id) } : f)));
    try {
      const res = await api('/folders/order', { method: 'PUT', body: { parentId, ids } });
      setFolders(res.folders);
    } catch (err) {
      handleAuthError(err);
      loadFolders().catch(() => {});
    }
  }

  // ----- pasta aberta: é minha ou compartilhada? -----
  const currentInfo =
    currentFolder === null || currentFolder === undefined
      ? null
      : folders.find((f) => f.id === currentFolder) ?? sharedFolders.find((f) => f.id === currentFolder) ?? null;
  const isSharedWithMe = Boolean(currentInfo && sharedFolders.some((f) => f.id === currentInfo.id));
  const liveEnabled = Boolean(currentInfo && (isSharedWithMe || currentInfo.memberCount > 0));

  const notesReloadTimer = useRef(null);
  const live = useLiveFolder(currentFolder, liveEnabled, {
    // alguém mexeu nos post-its: recarrega (agrupando avisos seguidos)
    onNotesChanged: () => {
      clearTimeout(notesReloadTimer.current);
      notesReloadTimer.current = setTimeout(() => {
        if (folderRef.current !== undefined) loadNotes(folderRef.current).catch(() => {});
        loadFolders().catch(() => {});
      }, 250);
    },
    onFolderChanged: (removed) => {
      loadFolders().catch(() => {});
      if (removed) {
        toast('Essa pasta foi apagada por quem criou.', 'info');
        setCurrentFolder(null);
      }
    },
    onKicked: () => {
      toast('Você não tem mais acesso a essa pasta compartilhada.', 'info');
      setCurrentFolder(null);
      loadFolders().catch(() => {});
    },
  });

  // ----- arrastar post-it até uma pasta -----
  // Só pastas do mesmo dono (numa pasta compartilhada de outra pessoa não há para onde mover)
  const dropTargets = isSharedWithMe
    ? []
    : [{ key: 'root', name: 'Mural geral', icon: '📌', depth: 1 }, ...flattenTree(folders).map((f) => ({ key: String(f.id), name: f.name, icon: f.icon, color: f.color, depth: f.depth }))].filter(
        (t) => t.key !== String(currentFolder ?? 'root'),
      );

  useEffect(() => {
    if (!dragNote) return;
    const onMove = (e) => {
      const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-drop-folder]');
      setDropHover(el?.dataset.dropFolder ?? null);
    };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, [dragNote]);

  function handleDragStart(note) {
    if (dropTargets.length) setDragNote(note);
  }

  // Soltou o post-it: se foi em cima de uma pasta da faixa, move para ela (com Desfazer)
  function handleDrop(note, x, y) {
    const el = dragNote ? document.elementFromPoint(x, y)?.closest?.('[data-drop-folder]') : null;
    setDragNote(null);
    setDropHover(null);
    if (!el) return false;
    const key = el.dataset.dropFolder;
    const targetId = key === 'root' ? null : Number(key);
    const from = note.folderId ?? null;
    (async () => {
      try {
        const data = await api(`/notes/${note.id}/folder`, { method: 'PATCH', body: { folderId: targetId } });
        dropFromBoard([note.id]);
        loadFolders().catch(() => {});
        offerUndo(data.message, async () => {
          try {
            await api(`/notes/${note.id}/folder`, { method: 'PATCH', body: { folderId: from } });
            refreshAll();
          } catch (err) {
            handleAuthError(err);
          }
        }, 'move');
      } catch (err) {
        handleAuthError(err);
      }
    })();
    return true;
  }

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

  // Pasta compartilhada: manda a posição do meu cursor em coordenadas do mural
  // (assim aparece no lugar certo para os outros mesmo com zoom/rolagem diferentes)
  const sendCursor = live.sendCursor;
  const freeBoard = !(isMobile && settings.mobileLayout !== 'free');
  useEffect(() => {
    const el = boardRef.current;
    if (!el || !liveEnabled || !freeBoard) return;
    const onMove = (e) => {
      if (e.pointerType === 'touch') return;
      const x = (e.clientX + el.scrollLeft) / zoom;
      const y = (e.clientY + el.scrollTop) / zoom;
      sendCursor(Math.round(x), Math.round(y));
    };
    el.addEventListener('pointermove', onMove);
    return () => el.removeEventListener('pointermove', onMove);
  }, [liveEnabled, freeBoard, zoom, sendCursor]);

  const replaceNote = (note) => setNotes((list) => list.map((n) => (n.id === note.id ? note : n)));

  // Foto do formulário: "keep" (não mexe), { dataUrl } (nova) ou "remove"
  async function saveImage(noteId, image) {
    if (image === 'remove') return (await api(`/notes/${noteId}/image`, { method: 'DELETE' })).note;
    if (image?.dataUrl) return (await api(`/notes/${noteId}/image`, { method: 'PUT', body: { dataUrl: image.dataUrl } })).note;
    return null;
  }

  async function handleSave(form, image = 'keep') {
    // Pede permissão de notificação na primeira vez que o usuário marca uma data
    if (form.eventDate && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    const targetFolder = form.folderId ?? null;
    try {
      if (modal.note) {
        const data = await api(`/notes/${modal.note.id}`, { method: 'PUT', body: form });
        const withImage = (await saveImage(modal.note.id, image)) ?? data.note;
        if (targetFolder !== (modal.note.folderId ?? null)) {
          // Mudou de pasta: sai deste mural
          const moved = await api(`/notes/${modal.note.id}/folder`, { method: 'PATCH', body: { folderId: targetFolder } });
          setNotes((list) => list.filter((n) => n.id !== modal.note.id));
          loadFolders().catch(() => {});
          toast(moved.message, 'success');
        } else {
          replaceNote(withImage);
          toast(data.message, 'success');
        }
      } else {
        // Nasce numa área visível da tela (funciona no PC e no celular, com ou sem zoom)
        const board = boardRef.current;
        const mobile = window.innerWidth <= 720;
        const noteW = mobile ? 180 : 240;
        const z = gridMode ? 1 : zoom;
        const body = {
          ...form,
          x: (board?.scrollLeft ?? 0) / z + 16 + Math.random() * Math.max(10, window.innerWidth / z - noteW - 32),
          y: (board?.scrollTop ?? 0) / z + (mobile ? 150 : 110) + Math.random() * Math.max(40, window.innerHeight / z - 450),
        };
        const data = await api('/notes', { method: 'POST', body });
        let created = data.note;
        try {
          created = (await saveImage(created.id, image)) ?? created;
        } catch (err) {
          toast(`Post-it criado, mas a foto não foi: ${err.message}`, 'error');
        }
        if (targetFolder === currentFolder) {
          setNotes((list) => [...list, created]);
          playSound('pop');
          toast(data.message, 'success');
        } else {
          toast(`Post-it criado na pasta "${folderName(targetFolder)}".`, 'success');
        }
        loadFolders().catch(() => {});
      }
      if (form.eventDate) loadAlerts().catch(() => {});
      return true;
    } catch (err) {
      // erro de preenchimento (o back recusou): o formulário mostra ao lado do campo, não num balão longe
      if (err.status === 400) return { error: err.message };
      handleAuthError(err);
      return false;
    }
  }

  // Mostra um aviso com "Desfazer" (o mesmo desfazer também roda com Ctrl+Z por alguns segundos)
  function offerUndo(message, undo, type = 'trash') {
    const entry = { undo, until: Date.now() + 7000 };
    lastUndo.current = entry;
    toast(message, type, {
      action: {
        label: 'Desfazer',
        onClick: () => {
          if (lastUndo.current === entry) lastUndo.current = null;
          playSound('undo');
          undo();
        },
      },
    });
  }

  // Depois de desfazer: recarrega o mural aberto, as pastas e os alertas
  const refreshAll = useCallback(() => {
    if (folderRef.current !== undefined) loadNotes(folderRef.current).catch(() => {});
    loadFolders().catch(() => {});
    loadAlerts().catch(() => {});
  }, [loadNotes, loadFolders, loadAlerts]);

  useEffect(() => {
    const onKey = (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName);
      if (typing || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      const entry = lastUndo.current;
      if (entry && Date.now() < entry.until) {
        e.preventDefault();
        lastUndo.current = null;
        entry.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const dropFromBoard = (ids) => {
    const set = new Set(ids);
    setNotes((list) => list.filter((n) => !set.has(n.id)));
    setAlerts((list) => list.filter((n) => !set.has(n.id)));
    setUpcoming((list) => list.filter((n) => !set.has(n.id)));
  };

  async function handleDelete(note) {
    try {
      await api(`/notes/${note.id}`, { method: 'DELETE' });
      playSound('delete');
      dropFromBoard([note.id]);
      loadFolders().catch(() => {});
      offerUndo(`"${note.title}" foi para a lixeira.`, async () => {
        try {
          await api(`/notes/${note.id}/restore`, { method: 'POST' });
          refreshAll();
          toast('Post-it de volta! ↩', 'success');
        } catch (err) {
          handleAuthError(err);
        }
      });
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function handleArchive(note) {
    try {
      await api(`/notes/${note.id}/archive`, { method: 'POST', body: { archived: true } });
      dropFromBoard([note.id]);
      loadFolders().catch(() => {});
      offerUndo(`"${note.title}" foi arquivado.`, async () => {
        try {
          await api(`/notes/${note.id}/archive`, { method: 'POST', body: { archived: false } });
          refreshAll();
        } catch (err) {
          handleAuthError(err);
        }
      }, 'archive');
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function handlePin(note) {
    // muda na tela na hora; o back confirma
    replaceNote({ ...note, pinned: !note.pinned });
    try {
      const data = await api(`/notes/${note.id}/pin`, { method: 'POST', body: { pinned: !note.pinned } });
      replaceNote(data.note);
      toast(data.message, 'success');
    } catch (err) {
      replaceNote(note);
      handleAuthError(err);
    }
  }

  async function handleDuplicate(note) {
    try {
      const data = await api(`/notes/${note.id}/duplicate`, { method: 'POST' });
      setNotes((list) => [...list, data.note]);
      playSound('pop');
      loadFolders().catch(() => {});
      toast(data.message, 'success');
    } catch (err) {
      handleAuthError(err);
    }
  }

  async function handleToggleCheck(note, itemId, done) {
    replaceNote({ ...note, checklist: note.checklist.map((i) => (i.id === itemId ? { ...i, done } : i)) });
    try {
      const data = await api(`/notes/${note.id}/checklist/${itemId}`, { method: 'PATCH', body: { done } });
      replaceNote(data.note);
      const all = data.note.checklist.length > 1 && data.note.checklist.every((i) => i.done);
      if (done) playSound(all ? 'done' : 'check');
      if (done && all) toast(`Checklist de "${note.title}" completa! 🎉`, 'success');
    } catch (err) {
      replaceNote(note);
      handleAuthError(err);
    }
  }

  async function handleResize(id, size) {
    try {
      replaceNote((await api(`/notes/${id}/size`, { method: 'PATCH', body: size })).note);
    } catch (err) {
      handleAuthError(err);
    }
  }

  // ----- seleção múltipla -----
  function toggleSelect(id) {
    setSelection((sel) => {
      const next = new Set(sel ?? []);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function runBatch(action, extra = {}) {
    const ids = [...(selection ?? [])];
    if (!ids.length) return;
    try {
      const data = await api('/notes/batch', { method: 'POST', body: { ids, action, ...extra } });
      setSelection(null);
      if (action === 'pin') {
        refreshAll();
        toast(data.message, 'success');
        return;
      }
      dropFromBoard(data.ids);
      loadFolders().catch(() => {});
      if (action === 'move') toast(data.message, 'success');
      else
        offerUndo(data.message, async () => {
          try {
            for (const id of data.ids) {
              if (action === 'delete') await api(`/notes/${id}/restore`, { method: 'POST' });
              else await api(`/notes/${id}/archive`, { method: 'POST', body: { archived: false } });
            }
            refreshAll();
          } catch (err) {
            handleAuthError(err);
          }
        });
    } catch (err) {
      handleAuthError(err);
    }
  }

  // ----- arrumar mural -----
  async function handleArrange() {
    const usable = (window.innerWidth / zoom) - 80;
    const widest = Math.max(230, ...notes.map((n) => n.width ?? 230)) + 30;
    const columns = Math.max(1, Math.min(8, Math.floor(usable / widest)));
    setArranging(true);
    try {
      const data = await api('/notes/arrange', { method: 'POST', body: { folderId: currentFolder, columns } });
      setNotes(data.notes);
      boardRef.current?.scrollTo({ left: 0, top: 0, behavior: 'smooth' });
      toast(data.message, 'success');
    } catch (err) {
      handleAuthError(err);
    } finally {
      setTimeout(() => setArranging(false), 900);
    }
  }

  // Esc sai do modo seleção
  useEffect(() => {
    if (selection === null) return;
    const onKey = (e) => e.key === 'Escape' && setSelection(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selection]);

  // Ctrl + rodinha do mouse = zoom (só no mural livre)
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey) || window.innerWidth <= 720) return;
      e.preventDefault();
      setZoomState((z) => {
        const value = Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z - Math.sign(e.deltaY) * 0.1)) * 10) / 10;
        try {
          localStorage.setItem(ZOOM_KEY, String(value));
        } catch {}
        return value;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

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

  // Fecha só aquele aviso ("1 dia antes" e "na hora" são avisos diferentes)
  async function handleDismiss(note) {
    setAlerts((list) => list.filter((n) => !(n.id === note.id && n.alertKey === note.alertKey)));
    try {
      await api(`/alerts/${note.id}/dismiss`, { method: 'POST', body: { key: note.alertKey } });
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
    clearSession();
    router.replace('/login');
  }

  const openNew = () => setModal({ open: true, note: null });
  const openEdit = (note) => setModal({ open: true, note });
  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeSpecial = useCallback(() => setSpecialPanel(null), []);
  const closeCalendar = useCallback(() => setCalendarOpen(false), []);
  const closeShare = useCallback(() => setShareFolder(null), []);

  // No celular, por padrão, os post-its viram uma grade que cabe na tela (sem rolar para o lado)
  const gridMode = isMobile && settings.mobileLayout !== 'free';
  const z = gridMode ? 1 : zoom;
  // filtro por etiqueta (clicando numa #etiqueta do post-it)
  const visibleNotes = tagFilter ? notes.filter((n) => n.tags.includes(tagFilter)) : notes;
  const shownNotes = gridMode ? [...visibleNotes].sort(readingOrder) : visibleNotes;
  const canvasW = Math.max(0, ...notes.map((n) => n.x + (n.width ?? 230) + 90));
  const canvasH = Math.max(0, ...notes.map((n) => n.y + (n.height ?? 300) + 90));
  // O mural "de fora" tem o tamanho já com zoom (para a rolagem funcionar);
  // por dentro os post-its continuam nas coordenadas reais e o conjunto é escalado
  const canvasStyle = gridMode ? undefined : { width: `max(100%, ${canvasW * z}px)`, height: `max(100%, ${canvasH * z}px)` };
  const zoomStyle = gridMode
    ? undefined
    : {
        width: `max(${100 / z}%, ${canvasW}px)`,
        height: `max(${100 / z}%, ${canvasH}px)`,
        transform: z === 1 ? undefined : `scale(${z})`,
      };
  const selecting = selection !== null;

  const scene = resolveScene(settings, weather);
  const isDay = weather?.isDay ?? true;
  const calm = settings.calmMode || autoCalm;

  // Tema, tamanho da letra e alto contraste valem para a página inteira; sons seguem as preferências
  useEffect(() => {
    applyAppearance({ theme: settings.theme, fontScale: settings.fontScale, highContrast: settings.highContrast });
  }, [settings.theme, settings.fontScale, settings.highContrast]);
  useEffect(() => {
    setSoundPrefs({ enabled: settings.sounds, volume: settings.soundVolume, calm });
  }, [settings.sounds, settings.soundVolume, calm]);
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
            shared={sharedFolders}
            rootCount={rootCount}
            current={currentFolder}
            onSelect={setCurrentFolder}
            onCreate={handleCreateFolder}
            onRename={handleRenameFolder}
            onDelete={handleDeleteFolder}
            onReorder={handleReorderFolders}
            onShare={setShareFolder}
            archivedCount={special.archived}
            trashCount={special.trash}
            onOpenSpecial={setSpecialPanel}
          />
        )}
        {liveEnabled && (
          <PresenceBar presence={live.presence} meId={user?.id} connected={live.connected} onOpen={() => setShareFolder(currentInfo)} />
        )}
        <motion.button
          className="gear-btn"
          onClick={() => setCalendarOpen(true)}
          aria-label="Calendário"
          title="Calendário do mês"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
        >
          <Icon name="calendar" size={21} />
        </motion.button>
        <motion.button
          className="gear-btn search-btn"
          onClick={() => setSearchOpen(true)}
          aria-label="Pesquisar post-its"
          title="Pesquisar (Ctrl + K)"
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.9 }}
        >
          <Icon name="search" size={21} />
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
          <Icon name="settings" size={21} />
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
          <div className={gridMode ? 'canvas-inner-grid' : 'canvas-zoom'} style={zoomStyle}>
            <AnimatePresence>
              {shownNotes.map((note, i) => (
                <PostIt
                  key={note.id}
                  note={note}
                  grid={gridMode}
                  index={i}
                  zoom={z}
                  calm={calm}
                  found={foundId === note.id}
                  selecting={selecting}
                  selected={selection?.has(note.id) ?? false}
                  arranging={arranging}
                  onMove={handleMove}
                  onResize={handleResize}
                  onEdit={openEdit}
                  onDelete={handleDelete}
                  onFocus={handleFocus}
                  onPin={handlePin}
                  onArchive={handleArchive}
                  onDuplicate={handleDuplicate}
                  onToggleCheck={handleToggleCheck}
                  onTagClick={(t) => setTagFilter((cur) => (cur === t ? null : t))}
                  onSelect={toggleSelect}
                  onDragStart={handleDragStart}
                  onDrop={handleDrop}
                />
              ))}
            </AnimatePresence>
            {liveEnabled && !gridMode && <LiveCursors cursors={live.cursors} />}
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Filtro ativo por etiqueta */}
      <AnimatePresence>
        {tagFilter && (
          <motion.div
            className="tag-filter-pill"
            initial={{ opacity: 0, y: -10, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: -10, x: '-50%' }}
          >
            <Icon name="tag" size={15} /> Mostrando <b style={{ background: tagColor(tagFilter) }}>#{tagFilter}</b>
            <span>
              {visibleNotes.length} de {notes.length}
            </span>
            <button type="button" onClick={() => setTagFilter(null)} aria-label="Tirar filtro">
              <Icon name="x" size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {user && (
        <BoardTools
          zoom={zoom}
          onZoom={setZoom}
          onArrange={handleArrange}
          arranging={arranging}
          selecting={selecting}
          onSelectMode={() => setSelection((s) => (s === null ? new Set() : null))}
          showFreeTools={!gridMode}
          hasNotes={notes.length > 0}
          focusOn={settings.showFocusTimer}
          onFocusTimer={() => handleSettingsChange({ showFocusTimer: !settings.showFocusTimer })}
        >
          {settings.showFocusTimer && (
            <FocusTimer
              key="focus"
              focusMinutes={settings.focusMinutes}
              breakMinutes={settings.breakMinutes}
              calm={calm}
              toast={toast}
              onClose={() => handleSettingsChange({ showFocusTimer: false })}
            />
          )}
        </BoardTools>
      )}

      <SelectionBar
        count={selecting ? selection.size : null}
        total={visibleNotes.length}
        folders={isSharedWithMe ? [] : flattenTree(folders)}
        canMove={!isSharedWithMe}
        currentFolder={currentFolder ?? null}
        onSelectAll={() => setSelection(new Set(visibleNotes.map((n) => n.id)))}
        onMove={(folderId) => runBatch('move', { folderId })}
        onPin={() => runBatch('pin')}
        onArchive={() => runBatch('archive')}
        onDelete={() => runBatch('delete')}
        onCancel={() => setSelection(null)}
      />

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
              {upcomingOpen ? (
                'Próximas datas'
              ) : (
                <>
                  <Icon name="calendar" size={15} /> {upcoming.length} data{upcoming.length === 1 ? '' : 's'} chegando
                </>
              )}
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
        folders={isSharedWithMe ? [{ ...currentInfo, depth: 1 }] : flattenTree(folders)}
        sharedLocked={isSharedWithMe}
        currentFolder={currentFolder ?? null}
        onClose={closeModal}
        onSave={handleSave}
      />
      <SearchPalette
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onPick={handlePick}
        folders={[...flattenTree(folders), ...sharedFolders.map((f) => ({ ...f, depth: 1 }))]}
      />
      <CalendarPanel
        open={calendarOpen}
        onClose={closeCalendar}
        onAuthError={handleAuthError}
        onPick={(it) => {
          setCalendarOpen(false);
          handlePick(it);
        }}
      />
      <ShareModal
        folder={shareFolder}
        me={user}
        onClose={closeShare}
        onChanged={() => loadFolders().catch(() => {})}
        onLeft={(id) => {
          if (currentFolder === id) setCurrentFolder(null);
          loadFolders().catch(() => {});
        }}
        toast={toast}
        onAuthError={handleAuthError}
      />
      <AnimatePresence>{dragNote && !gridMode && <FolderDropDock targets={dropTargets} hoverId={dropHover} />}</AnimatePresence>
      <TrashPanel
        mode={specialPanel}
        onClose={closeSpecial}
        folders={folders}
        onChanged={refreshAll}
        toast={toast}
        onAuthError={handleAuthError}
      />
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
        toast={toast}
        onAuthError={handleAuthError}
        onImported={refreshAll}
        onDeleted={(msg) => {
          clearSession();
          try {
            sessionStorage.setItem('mural_bye', msg);
          } catch {}
          router.replace('/login');
        }}
      />
      <AlertModal alerts={alerts} onDismiss={handleDismiss} calm={calm} />
    </main>
  );
}
