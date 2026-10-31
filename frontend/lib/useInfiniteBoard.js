'use client';

// "Motor" do mural infinito: mover o mural arrastando o fundo (com inércia), zoom suave que mira o
// cursor (roda + Ctrl, pinça do touchpad ou do celular), atalhos e "ajustar à tela".
//
// Por desempenho, durante o gesto o zoom é aplicado direto no DOM (sem redesenhar os post-its a cada
// movimento) e só é gravado no estado do React quando o gesto termina.
import { useCallback, useEffect, useMemo, useRef } from 'react';

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 2;
const COMMIT_DELAY = 140; // ms parado depois do gesto para gravar o zoom
const clampZoom = (z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

// Tamanho do mural na tela: o conteúdo (já com zoom) + sempre UMA TELA livre à direita e embaixo.
// Medido em telas (vw/vh) e não em pixels do mural: assim sobra espaço para mover em qualquer zoom.
export function boardStyles(w, h, z, top) {
  return {
    canvas: { width: `calc(${w * z}px + 100vw)`, height: `calc(${h * z + top}px + 100vh)` },
    layer: {
      width: `calc((${w * z}px + 100vw) / ${z})`,
      height: `calc((${h * z}px + 100vh) / ${z})`,
      transform: z === 1 ? undefined : `scale(${z})`,
    },
  };
}
const easeOut = (t) => 1 - (1 - t) ** 3;

// Elementos onde clicar e arrastar NÃO move o mural
const NOT_PAN = '.postit, button, a, input, textarea, select, label, .weather, .topbar, .board-tools, .upcoming, .minimap, .link-hit, .link-handle, [role="dialog"], .selection-bar, .toasts';

export function useInfiniteBoard({ boardRef, canvasRef, layerRef, enabled, zoom, onZoomCommit, contentSize, boardTop }) {
  const z = useRef(zoom);
  const size = useRef(contentSize);
  const listeners = useRef(new Set());
  const commitTimer = useRef(null);
  const anim = useRef(null);
  const inertia = useRef(null);
  const pan = useRef(null);
  const space = useRef(false);
  const gesturing = useRef(false);
  const movingTimer = useRef(null);

  size.current = contentSize;
  // estado do React mudou (botões, carregar): segue ele, a não ser no meio de um gesto
  useEffect(() => {
    if (!gesturing.current) z.current = zoom;
  }, [zoom]);

  // Enquanto o mural se mexe (zoom, arrastar, rolar, inércia), a classe "is-moving" pausa as animações
  // dos post-its e transforma o mural numa camada da placa de vídeo — é o que deixa o movimento liso.
  const markMoving = useCallback(() => {
    const board = boardRef.current;
    if (!board) return;
    if (!board.classList.contains('is-moving')) board.classList.add('is-moving');
    clearTimeout(movingTimer.current);
    movingTimer.current = setTimeout(() => board.classList.remove('is-moving'), 180);
  }, [boardRef]);

  const notify = useCallback(() => {
    markMoving();
    for (const fn of listeners.current) fn();
  }, [markMoving]);

  const subscribe = useCallback((fn) => {
    listeners.current.add(fn);
    return () => listeners.current.delete(fn);
  }, []);

  // Aplica o zoom `next` mantendo parado o ponto da tela (ax, ay) — ex.: onde está o cursor
  const apply = useCallback(
    (next, ax, ay) => {
      const board = boardRef.current;
      const canvas = canvasRef.current;
      const layer = layerRef.current;
      if (!board || !canvas || !layer) return;
      const prev = z.current;
      next = clampZoom(next);
      const rect = board.getBoundingClientRect();
      const px = ax - rect.left;
      const py = ay - rect.top;
      // ponto do mural que está debaixo do cursor
      const bx = (board.scrollLeft + px) / prev;
      const by = (board.scrollTop + py - boardTop) / prev;
      const { w, h } = size.current;
      const st = boardStyles(w, h, next, boardTop);
      layer.style.transform = st.layer.transform ?? '';
      layer.style.width = st.layer.width;
      layer.style.height = st.layer.height;
      canvas.style.width = st.canvas.width;
      canvas.style.height = st.canvas.height;
      z.current = next;
      board.scrollLeft = bx * next - px;
      board.scrollTop = by * next + boardTop - py;
      notify();
    },
    [boardRef, canvasRef, layerRef, boardTop, notify],
  );

  const scheduleCommit = useCallback(() => {
    gesturing.current = true;
    clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => {
      gesturing.current = false;
      onZoomCommit(Math.round(z.current * 100) / 100);
    }, COMMIT_DELAY);
  }, [onZoomCommit]);

  const stopMotion = useCallback(() => {
    cancelAnimationFrame(anim.current);
    cancelAnimationFrame(inertia.current);
    anim.current = null;
    inertia.current = null;
  }, []);

  const center = useCallback(() => {
    const r = boardRef.current?.getBoundingClientRect();
    return r ? [r.left + r.width / 2, r.top + r.height / 2] : [0, 0];
  }, [boardRef]);

  // Zoom animado (botões, teclado): ~220 ms, mirando o centro da tela ou um ponto dado
  const zoomTo = useCallback(
    (target, anchor) => {
      if (!enabled) return;
      stopMotion();
      const [ax, ay] = anchor ?? center();
      const from = z.current;
      const to = clampZoom(target);
      const t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / 220);
        apply(from + (to - from) * easeOut(t), ax, ay);
        if (t < 1) anim.current = requestAnimationFrame(step);
        else scheduleCommit();
      };
      anim.current = requestAnimationFrame(step);
    },
    [enabled, apply, center, scheduleCommit, stopMotion],
  );

  const zoomBy = useCallback((factor, anchor) => zoomTo(z.current * factor, anchor), [zoomTo]);

  // Rola suavemente até deixar o ponto (x, y) do mural no centro da tela
  const panTo = useCallback(
    (x, y, { animate = true } = {}) => {
      const board = boardRef.current;
      if (!board) return;
      stopMotion();
      const left = x * z.current - board.clientWidth / 2;
      const top = y * z.current + boardTop - board.clientHeight / 2;
      if (!animate) {
        board.scrollLeft = left;
        board.scrollTop = top;
        notify();
        return;
      }
      board.scrollTo({ left, top, behavior: 'smooth' });
    },
    [boardRef, boardTop, notify, stopMotion],
  );

  // Enquadra uma área do mural (ex.: todos os post-its) na tela
  const fitBox = useCallback(
    (box) => {
      const board = boardRef.current;
      if (!board || !box || !enabled) return;
      stopMotion();
      const pad = 60;
      const viewW = board.clientWidth - pad * 2;
      const viewH = board.clientHeight - boardTop - pad * 2 - 90; // espaço da barra de baixo
      const target = clampZoom(Math.min(1, viewW / Math.max(1, box.w), viewH / Math.max(1, box.h)));
      const from = z.current;
      const [cx, cy] = [box.x + box.w / 2, box.y + box.h / 2];
      const startLeft = board.scrollLeft;
      const startTop = board.scrollTop;
      const t0 = performance.now();
      const step = (now) => {
        const t = easeOut(Math.min(1, (now - t0) / 320));
        const cur = from + (target - from) * t;
        apply(cur, 0, 0);
        // cabe na tela: centraliza; não cabe (mesmo no zoom mínimo): começa pelo topo/esquerda, onde se lê
        const fitsW = box.w * cur <= board.clientWidth - pad;
        const fitsH = box.h * cur <= board.clientHeight - boardTop - 90 - pad;
        const endLeft = fitsW ? cx * cur - board.clientWidth / 2 : box.x * cur - pad / 2;
        const endTop = fitsH ? cy * cur + boardTop - (board.clientHeight + boardTop - 90) / 2 : box.y * cur - pad / 2;
        board.scrollLeft = startLeft + (endLeft - startLeft) * t;
        board.scrollTop = startTop + (endTop - startTop) * t;
        notify();
        if (t < 1) anim.current = requestAnimationFrame(step);
        else scheduleCommit();
      };
      anim.current = requestAnimationFrame(step);
    },
    [boardRef, boardTop, enabled, apply, notify, scheduleCommit, stopMotion],
  );

  useEffect(() => {
    const board = boardRef.current;
    if (!board || !enabled) return;

    // --- roda: Ctrl/⌘ + roda ou pinça do touchpad = zoom no cursor; sem Ctrl = rolar normal ---
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) {
        stopMotion();
        return; // rolagem nativa (touchpad com dois dedos já move o mural para todos os lados)
      }
      e.preventDefault();
      stopMotion();
      const unit = e.deltaMode === 1 ? 0.05 : 0.0022; // linhas (mouse) ou pixels (touchpad)
      const factor = Math.exp(-Math.max(-60, Math.min(60, e.deltaY)) * unit * (e.deltaMode === 1 ? 1 : 2));
      apply(z.current * factor, e.clientX, e.clientY);
      scheduleCommit();
    };

    // --- arrastar o fundo (mouse) = mover o mural, com inércia ao soltar ---
    const onDown = (e) => {
      if (e.pointerType === 'touch') return; // no toque o dedo já rola o mural
      const middle = e.button === 1;
      if (e.button !== 0 && !middle) return;
      if (!middle && !space.current && e.target.closest(NOT_PAN)) return;
      if (!board.contains(e.target)) return;
      e.preventDefault();
      stopMotion();
      pan.current = { x: e.clientX, y: e.clientY, left: board.scrollLeft, top: board.scrollTop, samples: [{ t: performance.now(), x: e.clientX, y: e.clientY }], id: e.pointerId };
      board.classList.add('is-panning');
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    };
    const onMove = (e) => {
      const p = pan.current;
      if (!p || e.pointerId !== p.id) return;
      board.scrollLeft = p.left - (e.clientX - p.x);
      board.scrollTop = p.top - (e.clientY - p.y);
      const now = performance.now();
      p.samples.push({ t: now, x: e.clientX, y: e.clientY });
      while (p.samples.length > 2 && now - p.samples[0].t > 90) p.samples.shift();
      notify();
    };
    const onUp = () => {
      const p = pan.current;
      pan.current = null;
      board.classList.remove('is-panning');
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (!p || p.samples.length < 2) return;
      // inércia: continua deslizando e vai freando
      const a = p.samples[0];
      const b = p.samples[p.samples.length - 1];
      const dt = Math.max(1, b.t - a.t);
      let vx = ((b.x - a.x) / dt) * 16;
      let vy = ((b.y - a.y) / dt) * 16;
      if (performance.now() - b.t > 80 || Math.hypot(vx, vy) < 1.5) return;
      const glide = () => {
        board.scrollLeft -= vx;
        board.scrollTop -= vy;
        vx *= 0.92;
        vy *= 0.92;
        notify();
        if (Math.hypot(vx, vy) > 0.4) inertia.current = requestAnimationFrame(glide);
      };
      inertia.current = requestAnimationFrame(glide);
    };

    // --- pinça com dois dedos no celular (modo livre) ---
    let pinch = null;
    const dist = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const mid = (t) => [(t[0].clientX + t[1].clientX) / 2, (t[0].clientY + t[1].clientY) / 2];
    const onTouchStart = (e) => {
      if (e.touches.length === 2) {
        stopMotion();
        pinch = { d: dist(e.touches), z: z.current };
      }
    };
    const onTouchMove = (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const [mx, my] = mid(e.touches);
      apply(pinch.z * (dist(e.touches) / pinch.d), mx, my);
      scheduleCommit();
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinch = null;
    };

    // --- teclado: + / − / 0 (100%) / Shift+1 (ajustar) e Espaço segurado = mãozinha ---
    const typing = () => {
      const el = document.activeElement;
      return el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    };
    const onKey = (e) => {
      if (typing() || e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.modal-backdrop, .drawer, .search-backdrop')) return;
      if (e.key === ' ' && !e.repeat) {
        space.current = true;
        board.classList.add('space-pan');
        e.preventDefault();
      } else if (e.key === '+' || e.key === '=') zoomBy(1.25);
      else if (e.key === '-' || e.key === '_') zoomBy(0.8);
      else if (e.key === '0') zoomTo(1);
      else if (e.key === '!' || (e.shiftKey && e.code === 'Digit1')) board.dispatchEvent(new CustomEvent('board-fit'));
    };
    const onKeyUp = (e) => {
      if (e.key === ' ') {
        space.current = false;
        board.classList.remove('space-pan');
      }
    };
    const onScroll = () => notify();

    board.addEventListener('wheel', onWheel, { passive: false });
    board.addEventListener('pointerdown', onDown);
    board.addEventListener('touchstart', onTouchStart, { passive: true });
    board.addEventListener('touchmove', onTouchMove, { passive: false });
    board.addEventListener('touchend', onTouchEnd);
    board.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      board.removeEventListener('wheel', onWheel);
      board.removeEventListener('pointerdown', onDown);
      board.removeEventListener('touchstart', onTouchStart);
      board.removeEventListener('touchmove', onTouchMove);
      board.removeEventListener('touchend', onTouchEnd);
      board.removeEventListener('scroll', onScroll);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      board.classList.remove('is-panning', 'space-pan');
      stopMotion();
    };
  }, [boardRef, enabled, apply, notify, scheduleCommit, stopMotion, zoomBy, zoomTo]);

  useEffect(() => () => (clearTimeout(commitTimer.current), clearTimeout(movingTimer.current)), []);

  // zoom "ao vivo" (pode estar à frente do estado do React no meio de um gesto)
  const getZoom = useCallback(() => z.current, []);

  // objeto estável: quem usa (minimapa, efeitos) não re-executa a cada renderização
  return useMemo(() => ({ zoomTo, zoomBy, panTo, fitBox, subscribe, getZoom }), [zoomTo, zoomBy, panTo, fitBox, subscribe, getZoom]);
}
