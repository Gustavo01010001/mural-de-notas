'use client';

// Fundo "clima dinâmico": simula o tempo no mural com partículas num <canvas>
// (chuva, raios, neve, neblina, umidade, poeira seca, sol, estrelas...).
import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const INTENSITY = { low: 0.5, medium: 1, high: 1.8 };
const rand = (a, b) => a + Math.random() * (b - a);

function createScene(scene, isDay, w, h, k) {
  const area = Math.min(1.4, (w * h) / (1400 * 800)) + 0.25; // menos partículas em telas pequenas
  const n = (base) => Math.round(base * k * area);
  const s = { scene, isDay, t: 0 };

  const drops = (count, speed, len) =>
    Array.from({ length: n(count) }, () => ({
      x: rand(-100, w + 100),
      y: rand(-h, h),
      len: rand(len[0], len[1]),
      v: rand(speed[0], speed[1]),
    }));

  const blobs = (count, rMin, rMax, yMax) =>
    Array.from({ length: count }, () => ({
      x: rand(-200, w),
      y: rand(-100, h * yMax),
      r: rand(rMin, rMax),
      v: rand(8, 24) * (Math.random() > 0.5 ? 1 : -1),
    }));

  const stars = (count) =>
    Array.from({ length: n(count) }, () => ({
      x: rand(0, w),
      y: rand(0, h * 0.75),
      r: rand(0.4, 1.6),
      p: rand(0, Math.PI * 2),
    }));

  switch (scene) {
    case 'rain':
      s.drops = drops(160, [700, 1000], [12, 24]);
      s.wind = -0.22;
      s.blobs = blobs(4, 300, 520, 0.3);
      break;
    case 'storm':
      s.drops = drops(300, [1100, 1500], [18, 32]);
      s.wind = -0.45;
      s.blobs = blobs(5, 320, 600, 0.35);
      s.nextFlash = rand(1.5, 4);
      s.flash = 0;
      s.bolt = null;
      break;
    case 'snow':
      s.flakes = Array.from({ length: n(140) }, () => ({
        x: rand(0, w),
        y: rand(-h, h),
        r: rand(1, 3.6),
        v: rand(25, 75),
        p: rand(0, Math.PI * 2),
      }));
      break;
    case 'fog':
      s.blobs = blobs(9, 280, 620, 1);
      break;
    case 'cloudy':
      s.blobs = blobs(7, 260, 520, 0.5);
      if (!isDay) s.stars = stars(40);
      break;
    case 'humid':
      s.blobs = blobs(5, 300, 560, 1);
      s.mist = Array.from({ length: n(70) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(1, 2.5), v: rand(6, 18) }));
      s.beads = Array.from({ length: n(55) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(2, 5.5), v: 0 }));
      break;
    case 'dry':
      s.dust = Array.from({ length: n(90) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.6, 2), v: rand(10, 40), p: rand(0, 6) }));
      if (!isDay) s.stars = stars(120);
      break;
    case 'clear':
      if (isDay) s.motes = Array.from({ length: n(40) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.8, 2), v: rand(4, 14), p: rand(0, 6) }));
      else {
        s.stars = stars(200);
        s.nextShoot = rand(2, 6);
        s.shoot = null;
      }
      break;
    default: // neutral
      s.motes = Array.from({ length: n(45) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.6, 1.8), v: rand(3, 10), p: rand(0, 6) }));
  }
  return s;
}

function makeBolt(w, h) {
  const pts = [[rand(w * 0.15, w * 0.85), 0]];
  let [x, y] = pts[0];
  while (y < h * rand(0.45, 0.75)) {
    x += rand(-50, 50);
    y += rand(25, 60);
    pts.push([x, y]);
  }
  return pts;
}

function drawBlob(ctx, b, rgb, alpha) {
  const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
  g.addColorStop(0, `rgba(${rgb},${alpha})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.fillStyle = g;
  ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
}

function moveBlobs(blobs, dt, w) {
  for (const b of blobs) {
    b.x += b.v * dt;
    if (b.x - b.r > w) b.x = -b.r;
    if (b.x + b.r < 0) b.x = w + b.r;
  }
}

function drawStars(ctx, stars, t) {
  for (const st of stars) {
    ctx.globalAlpha = 0.35 + 0.65 * Math.abs(Math.sin(t * 0.8 + st.p));
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawRain(ctx, drops, wind, dt, w, h, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const d of drops) {
    d.y += d.v * dt;
    d.x += d.v * wind * dt;
    if (d.y > h) {
      d.y = rand(-60, -10);
      d.x = rand(-100, w + 200);
    }
    ctx.moveTo(d.x, d.y);
    ctx.lineTo(d.x + d.len * wind, d.y + d.len);
  }
  ctx.stroke();
}

function step(ctx, s, dt, w, h) {
  s.t += dt;
  const { t } = s;
  ctx.clearRect(0, 0, w, h);

  switch (s.scene) {
    case 'rain':
      moveBlobs(s.blobs, dt, w);
      s.blobs.forEach((b) => drawBlob(ctx, b, '90,105,135', 0.18));
      drawRain(ctx, s.drops, s.wind, dt, w, h, 'rgba(170,200,255,0.35)', 1.2);
      break;

    case 'storm': {
      moveBlobs(s.blobs, dt * 2, w);
      s.blobs.forEach((b) => drawBlob(ctx, b, '70,60,110', 0.25));
      drawRain(ctx, s.drops, s.wind, dt, w, h, 'rgba(185,205,255,0.42)', 1.4);
      s.nextFlash -= dt;
      if (s.nextFlash <= 0) {
        s.flash = 1;
        s.bolt = makeBolt(w, h);
        s.nextFlash = rand(2.5, 7);
      }
      if (s.flash > 0) {
        // relâmpago: clarão + raio (no modo confortável o clarão quase some e não pisca)
        const flicker = !s.calm && s.flash > 0.6 && Math.random() > 0.5 ? 0.5 : 1;
        ctx.fillStyle = `rgba(220,225,255,${(s.calm ? 0.04 : 0.35) * s.flash * flicker})`;
        ctx.fillRect(0, 0, w, h);
        if (s.bolt) {
          ctx.save();
          ctx.strokeStyle = `rgba(255,255,255,${s.flash * (s.calm ? 0.4 : 1)})`;
          ctx.shadowColor = '#b9c6ff';
          ctx.shadowBlur = 25;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          s.bolt.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
          ctx.stroke();
          ctx.restore();
        }
        s.flash -= dt * 2.2;
      }
      break;
    }

    case 'snow':
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (const f of s.flakes) {
        f.y += f.v * dt;
        f.x += Math.sin(t * 1.2 + f.p) * 20 * dt;
        if (f.y > h + 5) {
          f.y = -5;
          f.x = rand(0, w);
        }
        ctx.globalAlpha = 0.5 + f.r / 7;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;

    case 'fog':
      moveBlobs(s.blobs, dt, w);
      s.blobs.forEach((b, i) => drawBlob(ctx, b, '190,200,215', 0.1 + 0.04 * Math.sin(t * 0.5 + i)));
      break;

    case 'cloudy':
      if (s.stars) drawStars(ctx, s.stars, t);
      moveBlobs(s.blobs, dt, w);
      s.blobs.forEach((b) => drawBlob(ctx, b, s.isDay ? '150,160,180' : '80,85,110', 0.16));
      break;

    case 'humid':
      moveBlobs(s.blobs, dt * 0.6, w);
      s.blobs.forEach((b) => drawBlob(ctx, b, '120,190,200', 0.09));
      ctx.fillStyle = 'rgba(190,235,255,0.35)';
      for (const m of s.mist) {
        m.y -= m.v * dt;
        m.x += Math.sin(t + m.y * 0.01) * 6 * dt;
        if (m.y < -5) {
          m.y = h + 5;
          m.x = rand(0, w);
        }
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // gotinhas condensadas "no vidro" que às vezes escorrem
      for (const b of s.beads) {
        if (b.v === 0 && Math.random() < 0.0008) b.v = rand(25, 70);
        if (b.v > 0) {
          b.y += b.v * dt;
          b.v *= 0.995;
          if (b.v < 4) b.v = 0;
          if (b.y > h + 10) {
            b.y = rand(-10, h * 0.3);
            b.x = rand(0, w);
            b.v = 0;
          }
        }
        ctx.fillStyle = 'rgba(170,220,255,0.10)';
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.beginPath();
        ctx.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.25, 0, Math.PI * 2);
        ctx.fill();
      }
      break;

    case 'dry':
      if (s.stars) drawStars(ctx, s.stars, t);
      for (const d of s.dust) {
        d.x += d.v * dt;
        d.y += Math.sin(t * 0.7 + d.p) * 8 * dt;
        if (d.x > w + 5) {
          d.x = -5;
          d.y = rand(0, h);
        }
        ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t + d.p));
        ctx.fillStyle = s.isDay ? '#ffcf7a' : '#d9b48a';
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      break;

    case 'clear':
      if (s.isDay) {
        // feixes de luz girando a partir do sol
        ctx.save();
        ctx.translate(w * 0.88, -40);
        ctx.rotate(t * 0.04);
        for (let i = 0; i < 9; i++) {
          ctx.rotate((Math.PI * 2) / 9);
          const g = ctx.createLinearGradient(0, 0, 0, Math.max(w, h));
          g.addColorStop(0, 'rgba(255,214,120,0.10)');
          g.addColorStop(1, 'rgba(255,214,120,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(-70, Math.max(w, h));
          ctx.lineTo(70, Math.max(w, h));
          ctx.fill();
        }
        ctx.restore();
        drawMotes(ctx, s.motes, t, dt, w, h, '#fff1c2');
      } else {
        drawStars(ctx, s.stars, t);
        s.nextShoot -= dt;
        if (s.nextShoot <= 0 && !s.shoot) {
          s.shoot = { x: rand(w * 0.2, w), y: rand(0, h * 0.3), life: 1 };
          s.nextShoot = rand(4, 10);
        }
        if (s.shoot) {
          const sh = s.shoot;
          sh.x -= 700 * dt;
          sh.y += 300 * dt;
          sh.life -= dt * 1.4;
          const g = ctx.createLinearGradient(sh.x, sh.y, sh.x + 120, sh.y - 50);
          g.addColorStop(0, `rgba(255,255,255,${Math.max(0, sh.life)})`);
          g.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.strokeStyle = g;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(sh.x, sh.y);
          ctx.lineTo(sh.x + 120, sh.y - 50);
          ctx.stroke();
          if (sh.life <= 0) s.shoot = null;
        }
      }
      break;

    default:
      drawMotes(ctx, s.motes, t, dt, w, h, '#ffffff');
  }
}

function drawMotes(ctx, motes, t, dt, w, h, color) {
  ctx.fillStyle = color;
  for (const m of motes) {
    m.y -= m.v * dt;
    m.x += Math.sin(t * 0.5 + m.p) * 5 * dt;
    if (m.y < -5) {
      m.y = h + 5;
      m.x = rand(0, w);
    }
    ctx.globalAlpha = 0.15 + 0.35 * Math.abs(Math.sin(t * 0.6 + m.p));
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function SceneCanvas({ scene, isDay, intensity, calm }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let w = 0;
    let h = 0;
    let state = null;
    let raf = 0;
    let last = performance.now();

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const k = (INTENSITY[intensity] ?? 1) * (reduced ? 0.4 : 1) * (calm ? 0.35 : 1);
      state = createScene(scene, isDay, w, h, k);
      state.calm = calm;
    }

    // Modo confortável: tudo continua se mexendo, só que mais devagar
    const speed = (reduced ? 0.3 : 1) * (calm ? 0.55 : 1);

    function loop(now) {
      const dt = Math.min(0.05, (now - last) / 1000) * speed;
      last = now;
      step(ctx, state, dt, w, h);
      raf = requestAnimationFrame(loop);
    }

    // Pausa quando a aba não está visível (economiza bateria)
    function onVisibility() {
      cancelAnimationFrame(raf);
      if (!document.hidden) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    }

    resize();
    raf = requestAnimationFrame(loop);
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [scene, isDay, intensity, calm]);

  return <canvas ref={canvasRef} />;
}

export default function WeatherBackground({ scene, isDay = true, intensity = 'medium', calm = false }) {
  return (
    <AnimatePresence>
      {scene && (
        <motion.div
          key={`${scene}-${isDay ? 'd' : 'n'}`}
          className={`scene-bg scene-${scene} ${isDay ? 'is-day' : 'is-night'}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.2 }}
          aria-hidden
        >
          <SceneCanvas scene={scene} isDay={isDay} intensity={intensity} calm={calm} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
