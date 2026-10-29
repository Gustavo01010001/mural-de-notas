// Bruno e Carol mexendo na pasta do grupo enquanto Maria, João e Ana estão no navegador
// Uso: npm run teste:ao-vivo -- <id da pasta> [segundos]   (rode antes o teste:grupo)
import fs from 'node:fs';
import path from 'node:path';

const API = 'http://127.0.0.1:4000/api';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const creds = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'contas-grupo.json'), 'utf8'));
const FOLDER = Number(process.argv[2]);
const SECONDS = Number(process.argv[3] ?? 60);
const people = [
  { name: 'Bruno', email: 'bruno.lima.tcc@exemplo.com', password: creds.bruno, ip: '10.79.0.4' },
  { name: 'Carol', email: 'carol.souza.tcc@exemplo.com', password: creds.carol, ip: '10.79.0.5' },
];
const call = async (p, { method = 'GET', token, body, ip } = {}) => {
  const r = await fetch(API + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(ip ? { 'X-Forwarded-For': ip } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return r.json().catch(() => ({}));
};
const log = (...a) => console.log(new Date().toLocaleTimeString('pt-BR'), ...a);

for (const p of people) p.token = (await call('/auth/login', { method: 'POST', ip: p.ip, body: { email: p.email, password: p.password } })).token;
const streams = people.map((p) => {
  const c = new AbortController();
  fetch(`${API}/live/folders/${FOLDER}`, { headers: { Authorization: `Bearer ${p.token}` }, signal: c.signal })
    .then(async (r) => {
      for await (const _ of r.body) {
      }
    })
    .catch(() => {});
  return c;
});
log('Bruno e Carol entraram na pasta', FOLDER);

const t0 = Date.now();
const cursorTimer = setInterval(() => {
  const t = (Date.now() - t0) / 1000;
  // Bruno desenha um oito, Carol anda em círculo
  call(`/live/folders/${FOLDER}/cursor`, { method: 'POST', token: people[0].token, body: { x: Math.round(520 + Math.sin(t) * 220), y: Math.round(360 + Math.sin(t * 2) * 110) } });
  call(`/live/folders/${FOLDER}/cursor`, { method: 'POST', token: people[1].token, body: { x: Math.round(300 + Math.cos(t * 0.8) * 160), y: Math.round(420 + Math.sin(t * 0.8) * 160) } });
}, 110);

const notes = (await call(`/notes?folder=${FOLDER}`, { token: people[0].token })).notes ?? [];
const tema = notes.find((n) => n.title === 'Tema do TCC');
const tarefas = notes.find((n) => n.title.startsWith('Divisão de tarefas'));
const steps = [
  [4, async () => (await call('/notes', { method: 'POST', token: people[0].token, body: { title: 'Bruno: deploy no ar', content: 'API publicada no Render ✔', color: 'green', folderId: FOLDER, x: 380, y: 140, tags: ['dev'] } }), log('Bruno colou "deploy no ar"'))],
  [10, async () => (await call('/notes', { method: 'POST', token: people[1].token, body: { title: 'Carol: revisar conclusão', content: 'Prazo: domingo', color: 'pink', folderId: FOLDER, x: 640, y: 140, tags: ['texto'] } }), log('Carol colou "revisar conclusão"'))],
  [16, async () => tema && (await call(`/notes/${tema.id}/position`, { method: 'PATCH', token: people[0].token, body: { x: 60, y: 130 } }), log('Bruno arrastou "Tema do TCC"'))],
  [22, async () => tarefas && (await call(`/notes/${tarefas.id}/checklist/${tarefas.checklist[9].id}`, { method: 'PATCH', token: people[1].token, body: { done: true } }), log('Carol marcou "Slides"'))],
];
for (const [s, fn] of steps) setTimeout(fn, s * 1000);

setTimeout(() => {
  clearInterval(cursorTimer);
  streams.forEach((c) => c.abort());
  log('fim');
  process.exit(0);
}, SECONDS * 1000);
