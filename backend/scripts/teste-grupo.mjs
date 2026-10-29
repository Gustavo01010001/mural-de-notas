// Teste de qualidade: grupo de TCC usando uma pasta compartilhada AO MESMO TEMPO.
// Usa a API de verdade (backend em 127.0.0.1:4000) com contas reais do banco local.
// Uso (backend rodando): npm run teste:grupo  → resultado em backend/data/resultado-grupo.json
// Contas já existentes da Maria e do João: MARIA_PASS=... JOAO_PASS=... npm run teste:grupo
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const API = process.env.API || 'http://127.0.0.1:4000/api';
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const CREDS_FILE = path.join(HERE, '..', 'data', 'contas-grupo.json'); // senhas de teste: em backend/data (nunca vai para o GitHub)
const TZ = 'America/Sao_Paulo';

const results = [];
const latencies = [];
const errors5xx = [];
const record = (cenario, resultado, detalhe) => {
  results.push({ cenario, resultado, detalhe });
  const icon = { OK: '✅', FALHA: '❌', ACHADO: '⚠️', INFO: 'ℹ️' }[resultado] ?? '•';
  console.log(`${icon} [${resultado}] ${cenario} — ${detalhe}`);
};

async function call(p, { method = 'GET', token, body, ip } = {}) {
  const t0 = performance.now();
  const sep = p.includes('?') ? '&' : '?';
  const res = await fetch(`${API}${p}${sep}tz=${encodeURIComponent(TZ)}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ip ? { 'X-Forwarded-For': ip } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = performance.now() - t0;
  latencies.push(ms);
  let data = null;
  try {
    data = await res.json();
  } catch {}
  if (res.status >= 500) errors5xx.push({ p, method, status: res.status, data });
  return { status: res.status, data, ms };
}

// ---------- contas do grupo ----------
let creds = {};
try {
  creds = JSON.parse(fs.readFileSync(CREDS_FILE, 'utf8'));
} catch {}
const pwd = (k, fixed) => fixed ?? (creds[k] ??= `Grupo#${crypto.randomBytes(6).toString('hex')}`);

const GROUP = [
  { key: 'maria', name: 'Maria Nova', email: 'maria.nova@exemplo.com', password: pwd('maria', process.env.MARIA_PASS), ip: '10.77.0.1' },
  { key: 'joao', name: 'João Colega', email: 'joao.colega@exemplo.com', password: pwd('joao', process.env.JOAO_PASS), ip: '10.77.0.2' },
  { key: 'ana', name: 'Ana Clara', email: 'ana.clara.tcc@exemplo.com', password: pwd('ana'), ip: '10.77.0.3' },
  { key: 'bruno', name: 'Bruno Lima', email: 'bruno.lima.tcc@exemplo.com', password: pwd('bruno'), ip: '10.77.0.4' },
  { key: 'carol', name: 'Carol Souza', email: 'carol.souza.tcc@exemplo.com', password: pwd('carol'), ip: '10.77.0.5' },
];
fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));

async function signIn(u) {
  let r = await call('/auth/login', { method: 'POST', ip: u.ip, body: { email: u.email, password: u.password } });
  if (r.status === 401) r = await call('/auth/register', { method: 'POST', ip: u.ip, body: { name: u.name, email: u.email, password: u.password } });
  if (!r.data?.token) throw new Error(`Não entrou como ${u.name}: ${r.status} ${JSON.stringify(r.data)}`);
  u.token = r.data.token;
  u.id = r.data.user.id;
  u.code = r.data.user.code;
}

// ---------- "ao vivo" (SSE) ----------
async function openStream(u, folderId) {
  const ctrl = new AbortController();
  const res = await fetch(`${API}/live/folders/${folderId}`, { headers: { Authorization: `Bearer ${u.token}` }, signal: ctrl.signal });
  const ev = { counts: {}, list: [], kicked: false, open: res.ok };
  (async () => {
    const dec = new TextDecoder();
    let buf = '';
    try {
      for await (const chunk of res.body) {
        buf += dec.decode(chunk, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const raw = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const type = raw.match(/^event: (.+)$/m)?.[1];
          const data = raw.match(/^data: (.+)$/m)?.[1];
          if (!type) continue;
          ev.counts[type] = (ev.counts[type] ?? 0) + 1;
          ev.list.push({ type, data: data ? JSON.parse(data) : null, at: Date.now() });
          if (type === 'kicked') ev.kicked = true;
        }
      }
    } catch {}
    ev.open = false;
  })();
  return { ev, close: () => ctrl.abort(), status: res.status };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))] : 0;
};
const addDays = (n) => new Date(Date.now() + n * 864e5).toLocaleDateString('en-CA', { timeZone: TZ });
const noteBody = (n, patch = {}) => ({
  title: n.title,
  content: n.content,
  color: n.color,
  checklist: n.checklist,
  tags: n.tags,
  eventDate: n.eventDate,
  eventType: n.eventType,
  eventTime: n.eventTime,
  remindBefore: n.remindBefore,
  repeat: n.repeat,
  folderId: n.folderId,
  ...patch,
});

// ======================================================================
const [maria, joao, ana, bruno, carol] = GROUP;
const members = [joao, ana, bruno, carol];

console.log('\n=== Preparação: 5 estudantes entram ===');
await Promise.all(GROUP.map(signIn));
record('Login simultâneo do grupo', 'OK', `${GROUP.length} contas entraram ao mesmo tempo (IDs: ${GROUP.map((u) => u.code).join(', ')})`);

// ---------- A: pasta do grupo + convites pelo ID ao mesmo tempo ----------
const stamp = new Date().toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const folder = (
  await call('/folders', { method: 'POST', token: maria.token, body: { name: `TCC Grupo 3 — App de Caronas`, icon: '🎓', color: 'purple' } })
).data.folder;
const invites = await Promise.all(members.map((m) => call(`/folders/${folder.id}/members`, { method: 'POST', token: maria.token, body: { who: m.code } })));
const okInv = invites.filter((r) => r.status === 201).length;
const membersList = (await call(`/folders/${folder.id}/members`, { token: maria.token })).data;
record(
  'Convidar 4 colegas pelo ID ao mesmo tempo',
  okInv === 4 && membersList.members.length === 4 ? 'OK' : 'FALHA',
  `${okInv}/4 convites aceitos; lista com ${membersList.members.length} participantes (${membersList.members.map((m) => m.name).join(', ')})`,
);
const leakedEmail = JSON.stringify(membersList).includes('@');
record('Participantes não veem e-mails', leakedEmail ? 'FALHA' : 'OK', leakedEmail ? 'apareceu e-mail na lista' : 'lista só com nome e ID');

// ---------- B: todos abrem a pasta (ao vivo) ----------
const streams = Object.fromEntries(await Promise.all(GROUP.map(async (u) => [u.key, await openStream(u, folder.id)])));
await wait(600);
const hello = streams.carol.ev.list.find((e) => e.type === 'hello');
const lastPresence = [...streams.maria.ev.list].reverse().find((e) => e.type === 'presence' || e.type === 'hello');
const online = (lastPresence?.data?.presence ?? []).length;
record('Todos abrem a pasta ao vivo', Object.values(streams).every((s) => s.status === 200) && hello ? 'OK' : 'FALHA', `5 conexões abertas; a dona vê ${online} pessoa(s) online`);

// ---------- C: todo mundo cola post-its AO MESMO TEMPO ----------
const ideas = {
  maria: [
    ['Tema do TCC', 'App de caronas solidárias para alunos do campus. Orientador: Prof. Ricardo.', 'yellow', ['tcc']],
    ['Cronograma — entrega parcial', 'Capítulos 1 a 3 revisados.', 'pink', ['prazo'], { eventDate: addDays(9), eventType: 'event', eventTime: '19:00', remindBefore: 1440 }],
    ['Acesso ao laboratório', 'Sala 214 · Wi-Fi LAB-214 · senha: (pedir na secretaria)', 'blue', ['importante']],
    ['Normas ABNT', 'Margens 3/2 cm, fonte 12, espaçamento 1,5. Citações > 3 linhas: recuo 4 cm.', 'green', ['abnt']],
    ['Banca', 'Prof. Ricardo, Profa. Helena, Prof. Marcos', 'orange', ['banca'], { eventDate: addDays(40), eventType: 'event' }],
    ['Link do repositório', 'github.com/grupo3/app-caronas (privado)', 'purple', ['dev']],
  ],
  joao: [
    ['Dados da pesquisa', 'Questionário: 128 respostas · 71% usariam o app · 54% já pegam carona', 'blue', ['dados', 'importante']],
    ['Referências', '1) Nielsen (1993) 2) Preece et al. (2013) 3) Pressman (2016)', 'green', ['abnt']],
    ['Diagrama de casos de uso', 'Atores: passageiro, motorista, admin', 'yellow', ['uml']],
    ['Reunião com orientador', 'Levar protótipo no Figma', 'pink', ['reuniao'], { eventDate: addDays(3), eventType: 'event', eventTime: '14:00', remindBefore: 60 }],
    ['Requisitos funcionais', 'RF01 cadastro · RF02 oferecer carona · RF03 avaliar', 'orange', ['requisitos']],
    ['Riscos', 'Pouca adesão; segurança dos usuários; LGPD', 'purple', ['riscos']],
  ],
  ana: [
    ['Entrevistas', '12 entrevistas feitas; transcrever 4 restantes', 'blue', ['dados']],
    ['Protótipo Figma', 'Telas: login, mapa, oferta, chat', 'pink', ['design']],
    ['Paleta de cores', 'Primária #2F9E44 · secundária #1C7ED6', 'green', ['design']],
    ['Personas', 'Lia (caloura, sem carro) · Rafa (veterano, tem carro)', 'yellow', ['ux']],
    ['Teste de usabilidade', '5 participantes, 4 tarefas', 'orange', ['ux'], { eventDate: addDays(14), eventType: 'event' }],
    ['Citação importante', '"Usabilidade é a qualidade de uso" — ISO 9126', 'purple', ['abnt']],
  ],
  bruno: [
    ['Banco de dados', 'Tabelas: usuarios, caronas, avaliacoes, mensagens', 'blue', ['dev']],
    ['API', 'Node + Express; rotas /caronas /usuarios /auth', 'green', ['dev']],
    ['Deploy', 'Render (back) + Vercel (front)', 'yellow', ['dev']],
    ['Testes', 'Jest no back, Playwright no front', 'pink', ['dev']],
    ['Custos', 'R$ 0 no plano grátis; domínio R$ 40/ano', 'orange', ['custos']],
    ['Bugs conhecidos', 'Mapa não carrega no Safari', 'purple', ['bug']],
  ],
  carol: [
    ['Introdução', 'Rascunho pronto, falta revisar', 'yellow', ['texto']],
    ['Metodologia', 'Pesquisa quantitativa + qualitativa', 'blue', ['texto']],
    ['Resultados', 'Gráficos no Google Sheets', 'green', ['dados']],
    ['Conclusão', 'Escrever depois dos testes', 'pink', ['texto']],
    ['Apresentação', 'Slides no Canva, 15 min', 'orange', ['apresentacao'], { eventDate: addDays(45), eventType: 'event' }],
    ['Dúvidas pro orientador', 'Podemos usar dados do questionário de 2023?', 'purple', ['duvida']],
  ],
};
const t0 = performance.now();
const creations = await Promise.all(
  GROUP.flatMap((u) =>
    ideas[u.key].map(([title, content, color, tags, extra], i) =>
      call('/notes', { method: 'POST', token: u.token, body: { title, content, color, tags, folderId: folder.id, x: 40 + (i % 3) * 260, y: 120 + GROUP.indexOf(u) * 230 + Math.floor(i / 3) * 10, ...extra } }),
    ),
  ),
);
const createdMs = performance.now() - t0;
const created = creations.filter((r) => r.status === 201).map((r) => r.data.note);
let list = (await call(`/notes?folder=${folder.id}`, { token: carol.token })).data.notes;
const allOwnedByMaria = created.every((n) => n.ownerId === maria.id);
const titles = new Set(list.map((n) => n.title));
record(
  '30 post-its colados ao mesmo tempo por 5 pessoas',
  created.length === 30 && list.length === 30 && titles.size === 30 ? 'OK' : 'FALHA',
  `${created.length}/30 criados em ${Math.round(createdMs)} ms; a Carol enxerga ${list.length} na pasta, ${titles.size} títulos diferentes`,
);
record('Post-its do grupo ficam com a dona da pasta', allOwnedByMaria ? 'OK' : 'FALHA', allOwnedByMaria ? 'todos pertencem à Maria (não somem se alguém sair do grupo)' : 'há post-it com outro dono');

// ---------- D: checklist de tarefas marcada por todos ao mesmo tempo ----------
const tasks = ['Introdução', 'Referencial', 'Metodologia', 'Questionário', 'Entrevistas', 'Protótipo', 'Banco de dados', 'API', 'Testes', 'Slides'];
const board = (
  await call('/notes', { method: 'POST', token: maria.token, body: { title: 'Divisão de tarefas', color: 'yellow', folderId: folder.id, checklist: tasks.map((text) => ({ text })), x: 820, y: 120 } })
).data.note;
const toggles = await Promise.all(board.checklist.map((item, i) => call(`/notes/${board.id}/checklist/${item.id}`, { method: 'PATCH', token: GROUP[i % 5].token, body: { done: true } })));
const afterToggle = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes.find((n) => n.id === board.id);
const doneCount = afterToggle.checklist.filter((i) => i.done).length;
record(
  'Checklist: 10 itens marcados por 5 pessoas no mesmo instante',
  doneCount === 10 && toggles.every((t) => t.status === 200) ? 'OK' : 'FALHA',
  `${doneCount}/10 itens marcados depois (nenhuma marcação se perdeu)`,
);

// ---------- E: três pessoas salvam o MESMO post-it ao mesmo tempo ----------
const dados = list.find((n) => n.title === 'Dados da pesquisa');
const versions = [
  [joao, 'Questionário: 128 respostas · 71% usariam o app · 54% já pegam carona · margem de erro 8%'],
  [ana, 'Questionário: 128 respostas · 71% usariam o app · + 12 entrevistas qualitativas'],
  [bruno, 'Questionário: 130 respostas (2 novas) · 71% usariam o app'],
];
await Promise.all(versions.map(([u, content]) => call(`/notes/${dados.id}`, { method: 'PUT', token: u.token, body: noteBody(dados, { content }) })));
const finalDados = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes.find((n) => n.id === dados.id);
const winner = versions.find(([, c]) => c === finalDados.content)?.[0]?.name ?? '???';
record(
  'Edição simultânea do mesmo post-it (3 pessoas)',
  'ACHADO',
  `sem erro e sem dado corrompido, mas ficou só a versão de ${winner}; as outras 2 foram descartadas sem nenhum aviso (o último a salvar vence)`,
);

// ---------- F: a "cópia velha" (janela de edição aberta) apaga o trabalho dos outros ----------
// O João abre "Divisão de tarefas" para editar (o formulário guarda uma cópia)...
const joaoCopy = (await call(`/notes?folder=${folder.id}`, { token: joao.token })).data.notes.find((n) => n.id === board.id);
// ...enquanto isso a Ana desmarca 2 tarefas e o Bruno adiciona uma observação
await call(`/notes/${board.id}/checklist/${joaoCopy.checklist[8].id}`, { method: 'PATCH', token: ana.token, body: { done: false } });
await call(`/notes/${board.id}/checklist/${joaoCopy.checklist[9].id}`, { method: 'PATCH', token: ana.token, body: { done: false } });
const beforeJoao = (await call(`/notes?folder=${folder.id}`, { token: bruno.token })).data.notes.find((n) => n.id === board.id);
await call(`/notes/${board.id}`, { method: 'PUT', token: bruno.token, body: noteBody(beforeJoao, { content: 'Bruno: API e banco atrasados 1 semana!' }) });
// ...e o João salva a cópia dele (só trocou o título)
await call(`/notes/${board.id}`, { method: 'PUT', token: joao.token, body: noteBody(joaoCopy, { title: 'Divisão de tarefas (atualizada)' }) });
const afterStale = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes.find((n) => n.id === board.id);
const lostBruno = !afterStale.content.includes('atrasados');
const lostAna = afterStale.checklist[8].done && afterStale.checklist[9].done;
record(
  'Salvar com a janela de edição aberta há um tempo',
  lostBruno || lostAna ? 'ACHADO' : 'OK',
  lostBruno || lostAna
    ? `o João salvou uma cópia antiga e apagou sem aviso ${[lostBruno && 'a observação do Bruno', lostAna && 'as 2 tarefas que a Ana desmarcou'].filter(Boolean).join(' e ')}`
    : 'nenhuma mudança dos outros se perdeu',
);

// ---------- G: todo mundo arrasta o mesmo post-it ----------
const tema = list.find((n) => n.title === 'Tema do TCC');
const drags = await Promise.all(GROUP.map((u, i) => call(`/notes/${tema.id}/position`, { method: 'PATCH', token: u.token, body: { x: 100 + i * 50, y: 300 + i * 20 } })));
const temaAfter = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes.find((n) => n.id === tema.id);
record('5 pessoas arrastam o mesmo post-it juntas', drags.every((d) => d.status === 200) && temaAfter.x >= 100 ? 'OK' : 'FALHA', `terminou numa das posições enviadas (${temaAfter.x}, ${temaAfter.y}), sem erro`);

// ---------- H: convidado exclui por engano e desfaz ----------
const duvidas = list.find((n) => n.title === 'Dúvidas pro orientador');
const del = await call(`/notes/${duvidas.id}`, { method: 'DELETE', token: carol.token });
const goneForAll = !(await call(`/notes?folder=${folder.id}`, { token: joao.token })).data.notes.some((n) => n.id === duvidas.id);
const inOwnerTrash = (await call('/notes/trash', { token: maria.token })).data.notes?.some((n) => n.id === duvidas.id);
const carolTrash = (await call('/notes/trash', { token: carol.token })).data.notes?.some((n) => n.id === duvidas.id);
const undo = await call(`/notes/${duvidas.id}/restore`, { method: 'POST', token: carol.token });
const back = (await call(`/notes?folder=${folder.id}`, { token: joao.token })).data.notes.some((n) => n.id === duvidas.id);
record('Colega exclui por engano e clica em Desfazer', del.status === 200 && goneForAll && back ? 'OK' : 'FALHA', `sumiu para todos, foi para a lixeira da dona (${inOwnerTrash ? 'sim' : 'não'}) e voltou com Desfazer (${undo.status})`);
record(
  'Lixeira de quem excluiu',
  carolTrash ? 'OK' : 'ACHADO',
  carolTrash ? 'a Carol vê o que excluiu' : 'o post-it excluído pela Carol NÃO aparece na lixeira dela, só na da Maria — depois que o "Desfazer" some, só a dona consegue recuperar',
);

// ---------- I: busca e calendário dos convidados ----------
const search = (await call('/notes/search?q=entrevistas', { token: bruno.token })).data.results ?? [];
record('Busca do convidado acha post-its do grupo', search.some((r) => r.title === 'Entrevistas') ? 'OK' : 'FALHA', `o Bruno buscou "entrevistas" e achou ${search.length} resultado(s)`);
const month = addDays(3).slice(0, 7);
const calJoao = (await call(`/calendar?month=${month}`, { token: joao.token })).data;
const calText = JSON.stringify(calJoao);
record(
  'Calendário do convidado mostra datas do grupo',
  calText.includes('Reunião com orientador') ? 'OK' : 'ACHADO',
  calText.includes('Reunião com orientador') ? 'a reunião aparece no calendário do João' : 'a "Reunião com orientador" (criada pelo próprio João na pasta do grupo) não aparece no calendário dele',
);
const alertsAna = JSON.stringify((await call('/alerts', { token: ana.token })).data);
record(
  'Lembretes do grupo chegam para os convidados',
  alertsAna.includes('Reunião com orientador') ? 'OK' : 'ACHADO',
  alertsAna.includes('Reunião com orientador') ? 'a Ana recebe o aviso da reunião' : 'a Ana não recebe o aviso da "Reunião com orientador" daqui a 3 dias (só a dona recebe)',
);

// ---------- J: permissões ----------
const perms = {
  renomear: (await call(`/folders/${folder.id}`, { method: 'PUT', token: joao.token, body: { name: 'Pasta do João', icon: '📁' } })).status,
  apagar: (await call(`/folders/${folder.id}`, { method: 'DELETE', token: joao.token })).status,
  convidar: (await call(`/folders/${folder.id}/members`, { method: 'POST', token: joao.token, body: { who: 'ZZZZ-ZZZZ' } })).status,
  tirarColega: (await call(`/folders/${folder.id}/members/${ana.id}`, { method: 'DELETE', token: joao.token })).status,
};
const joaoFolder = (await call('/folders', { method: 'POST', token: joao.token, body: { name: 'Minhas coisas', icon: '📁' } })).data.folder;
perms.levarPostIt = (await call(`/notes/${dados.id}/folder`, { method: 'PATCH', token: joao.token, body: { folderId: joaoFolder.id } })).status;
await call(`/folders/${joaoFolder.id}`, { method: 'DELETE', token: joao.token });
const blocked = Object.values(perms).every((s) => s >= 400 && s < 500);
record('Convidado não consegue renomear, apagar, convidar, tirar colega nem levar post-it embora', blocked ? 'OK' : 'FALHA', Object.entries(perms).map(([k, s]) => `${k}: ${s}`).join(' · '));
const folderStill = (await call('/folders', { token: maria.token })).data.folders.some((f) => f.id === folder.id && f.name.startsWith('TCC'));
record('Pasta do grupo continua inteira', folderStill ? 'OK' : 'FALHA', folderStill ? 'nome e pasta intactos' : 'a pasta mudou!');

// ---------- K: carga — todo mundo mexendo ao mesmo tempo por alguns segundos ----------
const before = latencies.length;
const burst = [];
const notesNow = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes;
for (let round = 0; round < 8; round++) {
  for (const u of GROUP) {
    const n = notesNow[(round * 5 + GROUP.indexOf(u)) % notesNow.length];
    burst.push(call(`/notes?folder=${folder.id}`, { token: u.token }));
    burst.push(call(`/notes/${n.id}/position`, { method: 'PATCH', token: u.token, body: { x: 50 + round * 30, y: 150 + round * 20 } }));
    burst.push(call(`/live/folders/${folder.id}/cursor`, { method: 'POST', token: u.token, body: { x: round * 40, y: round * 30 } }));
    burst.push(call('/notes/search?q=tcc', { token: u.token }));
    if (round % 2 === 0) burst.push(call('/notes', { method: 'POST', token: u.token, body: { title: `Anotação rápida ${u.name.split(' ')[0]} ${round}`, folderId: folder.id, color: 'yellow' } }));
  }
}
const burstRes = await Promise.all(burst);
const burstLat = latencies.slice(before);
const burstErr = burstRes.filter((r) => r.status >= 400 && r.status !== 429).length;
const burst429 = burstRes.filter((r) => r.status === 429).length;
record(
  `Carga: ${burstRes.length} pedidos de 5 pessoas ao mesmo tempo`,
  burstErr === 0 ? 'OK' : 'FALHA',
  `erros: ${burstErr} · bloqueios por excesso: ${burst429} · tempo p50 ${Math.round(pct(burstLat, 50))} ms · p95 ${Math.round(pct(burstLat, 95))} ms · pior ${Math.round(Math.max(...burstLat))} ms`,
);

// ---------- L: o "ao vivo" avisou todo mundo? ----------
await wait(800);
const liveSummary = GROUP.map((u) => `${u.name.split(' ')[0]}: ${streams[u.key].ev.counts.notes ?? 0} avisos, ${streams[u.key].ev.counts.cursor ?? 0} cursores`);
const everyoneGotNotes = GROUP.every((u) => (streams[u.key].ev.counts.notes ?? 0) > 0);
const everyoneGotCursors = GROUP.every((u) => (streams[u.key].ev.counts.cursor ?? 0) > 0);
record('Mudanças chegam ao vivo para todos', everyoneGotNotes ? 'OK' : 'FALHA', liveSummary.join(' · '));
record('Cursores dos colegas aparecem ao vivo', everyoneGotCursors ? 'OK' : 'FALHA', everyoneGotCursors ? 'todos receberam cursores dos outros' : 'alguém não recebeu cursores');
const ownEcho = streams.maria.ev.list.filter((e) => e.type === 'notes' && e.data?.by === maria.id).length;
record('Ninguém recebe aviso da própria mudança', ownEcho === 0 ? 'OK' : 'FALHA', `${ownEcho} eco(s) para a Maria`);

// ---------- M: tirar alguém do grupo ----------
const kick = await call(`/folders/${folder.id}/members/${carol.id}`, { method: 'DELETE', token: maria.token });
await wait(500);
const carolAfter = {
  ver: (await call(`/notes?folder=${folder.id}`, { token: carol.token })).status,
  editar: (await call(`/notes/${tema.id}`, { method: 'PUT', token: carol.token, body: noteBody(temaAfter, { content: 'hackeado' }) })).status,
  buscar: ((await call('/notes/search?q=entrevistas', { token: carol.token })).data.results ?? []).length,
};
const carolOut = carolAfter.ver >= 400 && carolAfter.editar >= 400 && carolAfter.buscar === 0;
record(
  'Dona tira a Carol do grupo',
  kick.status === 200 && carolOut && streams.carol.ev.kicked ? 'OK' : 'FALHA',
  `conexão ao vivo dela foi encerrada (${streams.carol.ev.kicked ? 'sim' : 'não'}); ver ${carolAfter.ver}, editar ${carolAfter.editar}, busca acha ${carolAfter.buscar}`,
);
const carolNotesStay = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes.some((n) => n.title === 'Introdução');
record('Post-its da Carol ficam com o grupo', carolNotesStay ? 'OK' : 'FALHA', carolNotesStay ? 'o que ela escreveu continua na pasta' : 'sumiram junto com ela');
await call(`/folders/${folder.id}/members`, { method: 'POST', token: maria.token, body: { who: carol.code } }); // volta para o grupo

// ---------- N: backup de quem é convidado ----------
const exp = (await call('/account/export', { token: joao.token })).data;
const expText = JSON.stringify(exp);
record(
  'Backup do convidado inclui as anotações do grupo?',
  expText.includes('Dados da pesquisa') ? 'OK' : 'ACHADO',
  expText.includes('Dados da pesquisa')
    ? 'o backup do João traz a pasta do grupo'
    : 'o "Baixar backup" do João não traz nada da pasta do grupo (nem o que ele mesmo escreveu lá) — só a dona tem cópia',
);

// ---------- fim ----------
for (const s of Object.values(streams)) s.close();
const finalCount = (await call(`/notes?folder=${folder.id}`, { token: maria.token })).data.notes.length;
record('Erros do servidor (5xx) durante todo o teste', errors5xx.length === 0 ? 'OK' : 'FALHA', `${errors5xx.length} erro(s) 5xx em ${latencies.length} pedidos`);
record('Estado final', 'INFO', `pasta "${folder.name}" (id ${folder.id}) com ${finalCount} post-its e 4 convidados`);

const summary = {
  quando: new Date().toISOString(),
  pasta: { id: folder.id, nome: folder.name },
  pedidos: latencies.length,
  tempo: { p50: Math.round(pct(latencies, 50)), p95: Math.round(pct(latencies, 95)), pior: Math.round(Math.max(...latencies)) },
  erros5xx: errors5xx,
  resultados: results,
};
fs.writeFileSync(path.join(HERE, '..', 'data', 'resultado-grupo.json'), JSON.stringify(summary, null, 2));
console.log(`\nTotal: ${results.filter((r) => r.resultado === 'OK').length} OK · ${results.filter((r) => r.resultado === 'FALHA').length} falha(s) · ${results.filter((r) => r.resultado === 'ACHADO').length} achado(s)`);
process.exit(0);
