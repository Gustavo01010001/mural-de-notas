// Testes automáticos da API (node:test, sem dependências).
// Sobe o backend numa porta própria com um banco TEMPORÁRIO — o banco real (data/) não é tocado.
// Rodar:  npm test   (na pasta backend)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
// Só funções puras aqui: nada que abra o banco no processo de teste (o banco é o do servidor temporário)
import { todayIn, nextOccurrence, isValidDate, occurrencesBetween, addDays as addDaysYmd } from '../src/utils/dates.js';
import { normalize } from '../src/utils/text.js';
import { parseDateTerms } from '../src/utils/dateQuery.js';
import { reminderStage } from '../src/utils/reminders.js';

const PORT = 4100 + Math.floor(Math.random() * 800);
const BASE = `http://127.0.0.1:${PORT}/api`;
const TZ = 'America/Sao_Paulo';
const dbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mural-test-'));
let server;

async function call(p, { method = 'GET', body, token, headers = {}, raw } = {}) {
  const res = await fetch(`${BASE}${p}${p.includes('?') ? '&' : '?'}tz=${TZ}`, {
    method,
    headers: {
      ...(body !== undefined || raw ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined),
  });
  return { status: res.status, headers: res.headers, data: await res.json().catch(() => null) };
}

let seq = 0;
async function newUser(name = 'Usuária Teste') {
  const n = seq++;
  const email = `user${Date.now()}${n}@teste.dev`;
  // cada usuário de teste "vem" de um IP diferente (o limite de cadastros é por IP)
  const ip = `10.9.${Math.floor(n / 250)}.${(n % 250) + 1}`;
  const r = await call('/auth/register', { method: 'POST', headers: { 'X-Forwarded-For': ip }, body: { name, email, password: 'senha-forte-1' } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return { token: r.data.token, user: r.data.user, email };
}

const today = () => todayIn(TZ);
const addDays = (ymd, n) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

before(async () => {
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    env: {
      ...process.env,
      PORT: String(PORT),
      HOST: '127.0.0.1',
      DB_DIR: dbDir,
      GOOGLE_WEATHER_API_KEY: '',
      SMTP_HOST: '',
      DEV_SHOW_RESET_LINK: '1', // só nos testes: o link de redefinir senha vem na resposta
    },
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`${BASE}/health`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('backend não subiu para os testes');
});

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise((r) => server.once('exit', r));
    server.kill();
    await exited;
  }
  // No Windows o arquivo do banco pode demorar um instante para ser liberado
  for (let i = 0; i < 10; i++) {
    try {
      fs.rmSync(dbDir, { recursive: true, force: true });
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
});

// ---------------------------------------------------------------------------
describe('Funções de data (unidade)', () => {
  test('valida datas reais e recusa impossíveis', () => {
    assert.ok(isValidDate('2024-02-29'));
    assert.ok(!isValidDate('2025-02-29'));
    assert.ok(!isValidDate('2026-13-01'));
    assert.ok(!isValidDate('27/10/2026'));
  });

  test('contagem para datas anuais e únicas', () => {
    assert.deepEqual(nextOccurrence('2000-10-27', true, '2026-10-27'), { date: '2026-10-27', daysUntil: 0, years: 26 });
    assert.equal(nextOccurrence('2000-10-28', true, '2026-10-27').daysUntil, 1);
    assert.equal(nextOccurrence('2000-10-26', true, '2026-10-27').daysUntil, 364); // já passou: ano que vem
    assert.equal(nextOccurrence('2026-12-25', false, '2026-10-27').daysUntil, 59);
    assert.equal(nextOccurrence('2026-10-01', false, '2026-10-27'), null); // evento único que passou
  });

  test('repetição semanal e mensal (dia 31 vira o último dia do mês)', () => {
    // 2026-10-05 é segunda-feira
    assert.equal(nextOccurrence('2026-10-05', 'weekly', '2026-10-07').date, '2026-10-12');
    assert.equal(nextOccurrence('2026-10-05', 'weekly', '2026-10-12').daysUntil, 0);
    assert.equal(nextOccurrence('2026-01-05', 'monthly', '2026-10-06').date, '2026-11-05');
    assert.equal(nextOccurrence('2026-01-31', 'monthly', '2026-02-01').date, '2026-02-28');
    // repetição só começa na data original
    assert.equal(nextOccurrence('2026-12-20', 'monthly', '2026-10-01').date, '2026-12-20');
    assert.deepEqual(occurrencesBetween('2026-10-05', 'weekly', '2026-10-01', '2026-10-31'), [
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    assert.deepEqual(occurrencesBetween('2026-10-15', 'none', '2026-11-01', '2026-11-30'), []);
  });

  test('etapa do lembrete: aviso antecipado e na hora', () => {
    const base = { nextDate: '2026-10-29', eventTime: '14:00', remindBefore: 60 };
    assert.equal(reminderStage(base, { date: '2026-10-29', minutes: 12 * 60 }), null); // 12:00
    assert.equal(reminderStage(base, { date: '2026-10-29', minutes: 13 * 60 + 5 }), 'soon'); // 13:05
    assert.equal(reminderStage(base, { date: '2026-10-29', minutes: 14 * 60 }), 'due'); // 14:00
    const dayBefore = { nextDate: '2026-10-30', eventTime: null, remindBefore: 1440 };
    assert.equal(reminderStage(dayBefore, { date: '2026-10-29', minutes: 9 * 60 }), 'soon'); // "1 dia antes"
    assert.equal(reminderStage({ ...dayBefore, nextDate: '2026-10-29' }, { date: '2026-10-29', minutes: 1 }), 'due');
  });

  test('busca entende datas escritas', () => {
    const p = parseDateTerms(['reuniao', 'outubro', '2027'], '2026-10-29');
    assert.deepEqual(p.terms, ['reuniao']);
    assert.deepEqual(p.range, { from: '2027-10-01', to: '2027-10-31' });
    assert.deepEqual(parseDateTerms(['25/12'], '2026-10-29').range, { from: '2026-12-25', to: '2026-12-25' });
    assert.deepEqual(parseDateTerms(['amanha'], '2026-10-29').range, { from: '2026-10-30', to: '2026-10-30' });
    assert.equal(parseDateTerms(['31/02'], '2026-10-29').range, null); // data impossível vira texto
  });

  test('fuso inválido não quebra (usa São Paulo)', () => {
    assert.match(todayIn('Fuso/Inexistente'), /^\d{4}-\d{2}-\d{2}$/);
  });

  test('busca ignora acento e maiúscula', () => {
    assert.equal(normalize('Reunião ÁGUA Café'), 'reuniao agua cafe');
  });
});

// ---------------------------------------------------------------------------
describe('Cadastro e login', () => {
  test('cadastro devolve token e nunca a senha', async () => {
    const r = await call('/auth/register', {
      method: 'POST',
      body: { name: '  Ana  ', email: 'ANA@Teste.dev', password: 'segredo123' },
    });
    assert.equal(r.status, 201);
    assert.ok(r.data.token.length >= 32);
    assert.equal(r.data.user.name, 'Ana');
    assert.equal(r.data.user.email, 'ana@teste.dev');
    assert.ok(!('password_hash' in r.data.user));
    assert.ok(!JSON.stringify(r.data).includes('segredo123'));
  });

  test('e-mail repetido (mesmo com maiúsculas) é recusado', async () => {
    const r = await call('/auth/register', { method: 'POST', body: { name: 'Ana 2', email: 'ana@TESTE.dev', password: 'segredo123' } });
    assert.equal(r.status, 409);
  });

  test('validações do cadastro', async () => {
    for (const body of [
      { name: 'A', email: 'a@b.com', password: '123456' },
      { name: 'Bia', email: 'sem-arroba', password: '123456' },
      { name: 'Bia', email: 'bia@b.com', password: '123' },
      {},
    ]) {
      const r = await call('/auth/register', { method: 'POST', body });
      assert.equal(r.status, 400, JSON.stringify(body));
      assert.ok(r.data.error);
    }
  });

  test('login certo, senha errada e e-mail inexistente', async () => {
    assert.equal((await call('/auth/login', { method: 'POST', body: { email: 'ana@teste.dev', password: 'segredo123' } })).status, 200);
    const wrong = await call('/auth/login', { method: 'POST', body: { email: 'ana@teste.dev', password: 'errada' } });
    const ghost = await call('/auth/login', { method: 'POST', body: { email: 'ninguem@teste.dev', password: 'errada' } });
    assert.equal(wrong.status, 401);
    assert.equal(ghost.status, 401);
    assert.equal(wrong.data.error, ghost.data.error); // não revela se o e-mail existe
  });

  test('rotas protegidas exigem token válido; logout invalida', async () => {
    assert.equal((await call('/notes')).status, 401);
    assert.equal((await call('/notes', { token: 'token-falso' })).status, 401);
    const { token } = await newUser();
    assert.equal((await call('/auth/me', { token })).status, 200);
    assert.equal((await call('/auth/logout', { method: 'POST', token })).status, 200);
    assert.equal((await call('/auth/me', { token })).status, 401);
  });
});

// ---------------------------------------------------------------------------
describe('Post-its', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('cria, lista, edita, move e apaga', async () => {
    const c = await call('/notes', { method: 'POST', token, body: { title: 'Mercado', content: 'Leite', color: 'blue', x: 100, y: 200 } });
    assert.equal(c.status, 201);
    const n = c.data.note;
    assert.equal(n.color, 'blue');
    assert.equal(n.folderId, null);
    assert.ok(Math.abs(n.rotation) <= 4);

    const list = await call('/notes', { token });
    assert.ok(list.data.notes.some((x) => x.id === n.id));

    const u = await call(`/notes/${n.id}`, { method: 'PUT', token, body: { title: 'Mercado!', content: 'Leite e pão', color: 'green' } });
    assert.equal(u.data.note.title, 'Mercado!');

    const m = await call(`/notes/${n.id}/position`, { method: 'PATCH', token, body: { x: -50, y: 30, bringToFront: true } });
    assert.equal(m.data.note.x, 0); // não deixa sair da tela pela esquerda
    assert.ok(m.data.note.z > n.z);

    assert.equal((await call(`/notes/${n.id}`, { method: 'DELETE', token })).status, 200);
    assert.equal((await call(`/notes/${n.id}`, { method: 'DELETE', token })).status, 404);
  });

  test('validações do post-it', async () => {
    const bad = [
      { title: '' },
      { title: 'x'.repeat(81) },
      { title: 'ok', content: 'x'.repeat(1001) },
      { title: 'ok', eventDate: '2026-02-30' },
    ];
    for (const body of bad) assert.equal((await call('/notes', { method: 'POST', token, body })).status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal((await call('/notes/abc', { method: 'DELETE', token })).status, 400);
    const own = (await call('/notes', { method: 'POST', token, body: { title: 'meu' } })).data.note;
    assert.equal((await call(`/notes/${own.id}/position`, { method: 'PATCH', token, body: { x: 'a', y: 1 } })).status, 400);
  });

  test('cor inválida vira amarelo e aniversário sempre repete todo ano', async () => {
    const r = await call('/notes', {
      method: 'POST',
      token,
      body: { title: 'Niver', color: 'rosa-choque', eventDate: '2000-05-10', eventType: 'birthday', repeatYearly: false },
    });
    assert.equal(r.data.note.color, 'yellow');
    assert.equal(r.data.note.repeatYearly, true);
  });

  test('texto com cara de SQL/HTML é salvo como texto comum', async () => {
    const title = "'); DROP TABLE notes; -- <script>alert(1)</script>";
    const r = await call('/notes', { method: 'POST', token, body: { title } });
    assert.equal(r.status, 201);
    assert.equal(r.data.note.title, title);
    assert.equal((await call('/notes', { token })).status, 200); // tabela continua lá
  });
});

// ---------------------------------------------------------------------------
describe('Datas importantes e alertas', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('aniversário hoje aparece no alerta com a idade; fechar some só hoje', async () => {
    const [y, m, d] = today().split('-');
    const birth = `${Number(y) - 30}-${m}-${d}`;
    const { data } = await call('/notes', { method: 'POST', token, body: { title: 'Aniversário da Bia', eventDate: birth, eventType: 'birthday' } });
    const id = data.note.id;
    assert.equal(data.note.isToday, true);
    assert.equal(data.note.years, 30);

    let a = await call('/alerts', { token });
    assert.ok(a.data.alerts.some((n) => n.id === id));

    await call(`/alerts/${id}/dismiss`, { method: 'POST', token });
    a = await call('/alerts', { token });
    assert.ok(!a.data.alerts.some((n) => n.id === id));

    // trocar a data faz o alerta valer de novo
    await call(`/notes/${id}`, { method: 'PUT', token, body: { title: 'Aniversário da Bia', eventDate: `${Number(y) - 31}-${m}-${d}`, eventType: 'birthday' } });
    a = await call('/alerts', { token });
    assert.ok(a.data.alerts.some((n) => n.id === id));
  });

  test('próximos 7 dias entram em "próximas datas"; passado e longe não', async () => {
    const soon = await call('/notes', { method: 'POST', token, body: { title: 'Prova', eventDate: addDays(today(), 3), eventType: 'event' } });
    const far = await call('/notes', { method: 'POST', token, body: { title: 'Viagem', eventDate: addDays(today(), 30), eventType: 'event' } });
    const past = await call('/notes', { method: 'POST', token, body: { title: 'Show', eventDate: addDays(today(), -5), eventType: 'event' } });
    assert.equal(soon.data.note.daysUntil, 3);
    assert.equal(past.data.note.daysUntil, null);
    const { data } = await call('/alerts', { token });
    const ids = data.upcoming.map((n) => n.id);
    assert.ok(ids.includes(soon.data.note.id));
    assert.ok(!ids.includes(far.data.note.id));
    assert.ok(!ids.includes(past.data.note.id));
  });
});

// ---------------------------------------------------------------------------
describe('Pastas', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('cria, impede nome repetido e valida', async () => {
    const r = await call('/folders', { method: 'POST', token, body: { name: '  Trabalho   novo ', icon: '💼' } });
    assert.equal(r.status, 201);
    assert.equal(r.data.folder.name, 'Trabalho novo');
    assert.equal((await call('/folders', { method: 'POST', token, body: { name: 'trabalho NOVO' } })).status, 409);
    assert.equal((await call('/folders', { method: 'POST', token, body: { name: '   ' } })).status, 400);
    assert.equal((await call('/folders', { method: 'POST', token, body: { name: 'x'.repeat(41) } })).status, 400);
    // ícone que não é emoji: avisa (antes virava 📁 sem dizer nada)
    const weird = await call('/folders', { method: 'POST', token, body: { name: 'Ícone estranho', icon: '<b>' } });
    assert.equal(weird.status, 400);
    assert.match(weird.data.error, /emoji/);
    // qualquer emoji vale, inclusive fora da lista da tela
    assert.equal((await call('/folders', { method: 'POST', token, body: { name: 'Formatura', icon: '🎓' } })).data.folder.icon, '🎓');
    assert.equal((await call('/folders', { method: 'POST', token, body: { name: 'Sem ícone' } })).data.folder.icon, '📁');
  });

  test('post-its ficam na pasta certa, contadores batem, mover e apagar pasta', async () => {
    const f = (await call('/folders', { method: 'POST', token, body: { name: 'Faculdade', icon: '📚' } })).data.folder;
    const inF = (await call('/notes', { method: 'POST', token, body: { title: 'Cálculo', folderId: f.id } })).data.note;
    const inRoot = (await call('/notes', { method: 'POST', token, body: { title: 'Solto' } })).data.note;

    const listF = await call(`/notes?folder=${f.id}`, { token });
    assert.deepEqual(listF.data.notes.map((n) => n.id), [inF.id]);
    const root = await call('/notes?folder=root', { token });
    assert.ok(root.data.notes.some((n) => n.id === inRoot.id) && !root.data.notes.some((n) => n.id === inF.id));

    let folders = await call('/folders', { token });
    assert.equal(folders.data.folders.find((x) => x.id === f.id).noteCount, 1);

    const mv = await call(`/notes/${inRoot.id}/folder`, { method: 'PATCH', token, body: { folderId: f.id } });
    assert.equal(mv.data.note.folderId, f.id);
    assert.equal((await call(`/notes/${inRoot.id}/folder`, { method: 'PATCH', token, body: { folderId: 999999 } })).status, 404);

    assert.equal((await call(`/folders/${f.id}`, { method: 'PUT', token, body: { name: 'Facul', icon: '🧠' } })).data.folder.name, 'Facul');

    const del = await call(`/folders/${f.id}`, { method: 'DELETE', token });
    assert.equal(del.status, 200);
    const after = await call('/notes?folder=root', { token });
    assert.ok([inF.id, inRoot.id].every((id) => after.data.notes.some((n) => n.id === id))); // nada se perdeu
    assert.equal((await call(`/notes?folder=${f.id}`, { token })).status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Busca', () => {
  let token;
  before(async () => {
    ({ token } = await newUser());
    const f = (await call('/folders', { method: 'POST', token, body: { name: 'Receitas', icon: '🍳' } })).data.folder;
    await call('/notes', { method: 'POST', token, body: { title: 'Bolo de cenoura', content: 'Cobertura de chocolate', folderId: f.id } });
    await call('/notes', { method: 'POST', token, body: { title: 'Brigadeiro', content: 'Chocolate em pó e leite condensado' } });
    await call('/notes', { method: 'POST', token, body: { title: 'Reunião de alinhamento', content: 'Levar relatório' } });
  });

  test('sem acento, várias palavras, em todas as pastas', async () => {
    let r = await call(`/notes/search?q=${encodeURIComponent('REUNIAO relatorio')}`, { token });
    assert.deepEqual(r.data.results.map((n) => n.title), ['Reunião de alinhamento']);

    r = await call('/notes/search?q=chocolate', { token });
    assert.equal(r.data.results.length, 2);
    const bolo = r.data.results.find((n) => n.title === 'Bolo de cenoura');
    assert.equal(bolo.folderName, 'Receitas');
    assert.equal(bolo.folderIcon, '🍳');
  });

  test('título pesa mais que o texto; busca vazia não traz nada', async () => {
    await call('/notes', { method: 'POST', token, body: { title: 'Chocolate quente', content: 'inverno' } });
    const r = await call('/notes/search?q=chocolate', { token });
    assert.equal(r.data.results[0].title, 'Chocolate quente');
    assert.deepEqual((await call('/notes/search?q=%20%20', { token })).data.results, []);
  });
});

// ---------------------------------------------------------------------------
describe('Privacidade entre usuários', () => {
  test('um usuário não vê, nem mexe, nos post-its e pastas de outro', async () => {
    const a = await newUser('Dona A');
    const b = await newUser('Dono B');
    const folderA = (await call('/folders', { method: 'POST', token: a.token, body: { name: 'Segredos' } })).data.folder;
    const noteA = (await call('/notes', { method: 'POST', token: a.token, body: { title: 'Senha do cofre: só minha', folderId: folderA.id } })).data.note;

    assert.equal((await call(`/notes?folder=${folderA.id}`, { token: b.token })).status, 404);
    assert.equal((await call(`/notes/${noteA.id}`, { method: 'PUT', token: b.token, body: { title: 'hackeado' } })).status, 404);
    assert.equal((await call(`/notes/${noteA.id}/position`, { method: 'PATCH', token: b.token, body: { x: 1, y: 1 } })).status, 404);
    assert.equal((await call(`/notes/${noteA.id}/folder`, { method: 'PATCH', token: b.token, body: { folderId: null } })).status, 404);
    assert.equal((await call(`/notes/${noteA.id}`, { method: 'DELETE', token: b.token })).status, 404);
    assert.equal((await call(`/alerts/${noteA.id}/dismiss`, { method: 'POST', token: b.token })).status, 404);
    assert.equal((await call(`/folders/${folderA.id}`, { method: 'DELETE', token: b.token })).status, 404);
    assert.equal((await call('/notes', { method: 'POST', token: b.token, body: { title: 'intruso', folderId: folderA.id } })).status, 404);
    assert.equal((await call('/notes/search?q=cofre', { token: b.token })).data.results.length, 0);
    assert.equal((await call('/folders', { token: b.token })).data.folders.length, 0);

    // e o post-it da A continua intacto
    const still = await call(`/notes?folder=${folderA.id}`, { token: a.token });
    assert.equal(still.data.notes[0].title, 'Senha do cofre: só minha');
  });
});

// ---------------------------------------------------------------------------
describe('Configurações e perfil', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('padrões, salvar válido, recusar inválido, ignorar desconhecido', async () => {
    const d = (await call('/settings', { token })).data.settings;
    assert.equal(d.mobileLayout, 'grid');
    assert.equal(d.calmMode, false);

    const ok = await call('/settings', {
      method: 'PUT',
      token,
      body: { calmMode: true, warmFilter: 'high', bgDim: 40, autoCalmAfter: 60, backgroundMode: 'storm', hacker: 'x' },
    });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.settings.warmFilter, 'high');
    assert.ok(!('hacker' in ok.data.settings));

    for (const body of [{ bgDim: 80 }, { bgDim: 12.5 }, { calmMode: 'sim' }, { autoCalmAfter: 45 }, { backgroundMode: 'lava' }, { mobileLayout: 'lista' }]) {
      assert.equal((await call('/settings', { method: 'PUT', token, body })).status, 400, JSON.stringify(body));
    }
    assert.equal((await call('/settings', { token })).data.settings.bgDim, 40); // valor inválido não estragou o salvo
  });

  test('trocar nome', async () => {
    assert.equal((await call('/profile', { method: 'PUT', token, body: { name: 'Nome Novo' } })).data.user.name, 'Nome Novo');
    assert.equal((await call('/profile', { method: 'PUT', token, body: { name: 'x' } })).status, 400);
  });
});

// ---------------------------------------------------------------------------
describe('Lixeira e desfazer', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('excluir manda para a lixeira; desfazer restaura; apagar de vez some', async () => {
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'Ideia preciosa', eventDate: today(), eventType: 'event' } })).data.note;
    assert.equal((await call(`/notes/${n.id}`, { method: 'DELETE', token })).status, 200);

    // some do mural, dos alertas e da busca, mas aparece na lixeira
    assert.ok(!(await call('/notes', { token })).data.notes.some((x) => x.id === n.id));
    assert.ok(!(await call('/alerts', { token })).data.alerts.some((x) => x.id === n.id));
    assert.equal((await call('/notes/search?q=preciosa', { token })).data.results.length, 0);
    const trash = await call('/notes/trash', { token });
    assert.equal(trash.data.days, 30);
    assert.equal(trash.data.notes[0].status, 'trash');
    assert.equal((await call('/folders', { token })).data.trashCount, 1);

    // na lixeira não dá para editar
    assert.equal((await call(`/notes/${n.id}`, { method: 'PUT', token, body: { title: 'x' } })).status, 404);

    // desfazer
    const r = await call(`/notes/${n.id}/restore`, { method: 'POST', token });
    assert.equal(r.data.note.status, 'active');
    assert.ok((await call('/notes', { token })).data.notes.some((x) => x.id === n.id));

    // apagar de vez só funciona para quem está na lixeira
    assert.equal((await call(`/notes/${n.id}/permanent`, { method: 'DELETE', token })).status, 404);
    await call(`/notes/${n.id}`, { method: 'DELETE', token });
    assert.equal((await call(`/notes/${n.id}/permanent`, { method: 'DELETE', token })).status, 200);
    assert.equal((await call('/notes/trash', { token })).data.notes.length, 0);
  });

  test('esvaziar lixeira', async () => {
    for (const title of ['a', 'b']) {
      const n = (await call('/notes', { method: 'POST', token, body: { title } })).data.note;
      await call(`/notes/${n.id}`, { method: 'DELETE', token });
    }
    const r = await call('/notes/trash', { method: 'DELETE', token });
    assert.match(r.data.message, /2 post-its/);
    assert.equal((await call('/notes/trash', { token })).data.notes.length, 0);
  });
});

// ---------------------------------------------------------------------------
describe('Fixar, arquivar, duplicar, checklist e etiquetas', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('fixar e arquivar', async () => {
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'Importante' } })).data.note;
    assert.equal((await call(`/notes/${n.id}/pin`, { method: 'POST', token, body: { pinned: true } })).data.note.pinned, true);

    await call(`/notes/${n.id}/archive`, { method: 'POST', token, body: { archived: true } });
    assert.ok(!(await call('/notes', { token })).data.notes.some((x) => x.id === n.id));
    const arch = await call('/notes/archived', { token });
    assert.equal(arch.data.notes[0].id, n.id);
    assert.equal((await call('/folders', { token })).data.archivedCount, 1);
    // arquivados continuam aparecendo na busca
    assert.equal((await call('/notes/search?q=importante', { token })).data.results[0].status, 'archived');

    await call(`/notes/${n.id}/archive`, { method: 'POST', token, body: { archived: false } });
    assert.ok((await call('/notes', { token })).data.notes.some((x) => x.id === n.id));
  });

  test('checklist: salvar, marcar item e validar', async () => {
    const n = (
      await call('/notes', {
        method: 'POST',
        token,
        body: { title: 'Mercado', checklist: [{ text: 'Pão' }, { text: 'Café', done: true }, { text: '   ' }] },
      })
    ).data.note;
    assert.equal(n.checklist.length, 2); // item vazio é descartado
    assert.equal(n.checklist[1].done, true);

    const item = n.checklist[0];
    const r = await call(`/notes/${n.id}/checklist/${item.id}`, { method: 'PATCH', token, body: { done: true } });
    assert.ok(r.data.note.checklist.every((i) => i.done));
    assert.equal((await call(`/notes/${n.id}/checklist/nao-existe`, { method: 'PATCH', token, body: { done: true } })).status, 404);

    const big = Array.from({ length: 31 }, (_, i) => ({ text: `item ${i}` }));
    assert.equal((await call('/notes', { method: 'POST', token, body: { title: 'x', checklist: big } })).status, 400);
    assert.equal((await call('/notes', { method: 'POST', token, body: { title: 'x', checklist: 'pão' } })).status, 400);
  });

  test('etiquetas: normaliza, valida e busca por #etiqueta', async () => {
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'Bug no login', tags: ['#Urgente', 'trabalho', 'urgente', ' Front End '] } })).data.note;
    assert.deepEqual(n.tags, ['urgente', 'trabalho', 'front-end']);
    for (const tags of [['<script>'], ['x'.repeat(21)], ['a', 'b', 'c', 'd', 'e', 'f', 'g']]) {
      assert.equal((await call('/notes', { method: 'POST', token, body: { title: 'x', tags } })).status, 400, JSON.stringify(tags));
    }
    await call('/notes', { method: 'POST', token, body: { title: 'Outro', tags: ['ideia'] } });
    const r = await call(`/notes/search?q=${encodeURIComponent('#urgente')}`, { token });
    assert.deepEqual(r.data.results.map((x) => x.title), ['Bug no login']);
  });

  test('duplicar copia tudo (menos o fixado) e desloca um pouco', async () => {
    const src = (await call('/notes', { method: 'POST', token, body: { title: 'Modelo', content: 'texto', checklist: [{ text: 'a' }], tags: ['ideia'], x: 100, y: 100 } })).data.note;
    await call(`/notes/${src.id}/pin`, { method: 'POST', token, body: { pinned: true } });
    const copy = (await call(`/notes/${src.id}/duplicate`, { method: 'POST', token })).data.note;
    assert.notEqual(copy.id, src.id);
    assert.equal(copy.title, 'Modelo');
    assert.deepEqual(copy.tags, ['ideia']);
    assert.equal(copy.checklist[0].text, 'a');
    assert.equal(copy.pinned, false);
    assert.equal(copy.x, 130);
  });

  test('tamanho tem limites', async () => {
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'Grande' } })).data.note;
    const r = await call(`/notes/${n.id}/size`, { method: 'PATCH', token, body: { width: 9999, height: 10 } });
    assert.equal(r.data.note.width, 520);
    assert.equal(r.data.note.height, 140);
    assert.equal((await call(`/notes/${n.id}/size`, { method: 'PATCH', token, body: { width: 'a', height: 1 } })).status, 400);
  });
});

// ---------------------------------------------------------------------------
describe('Ações em lote e arrumar mural', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('mover, arquivar e excluir vários de uma vez', async () => {
    const folder = (await call('/folders', { method: 'POST', token, body: { name: 'Destino' } })).data.folder;
    const ids = [];
    for (let i = 0; i < 4; i++) ids.push((await call('/notes', { method: 'POST', token, body: { title: `n${i}` } })).data.note.id);

    const mv = await call('/notes/batch', { method: 'POST', token, body: { ids: ids.slice(0, 2), action: 'move', folderId: folder.id } });
    assert.match(mv.data.message, /2 post-its movidos para "Destino"/);
    assert.equal((await call(`/notes?folder=${folder.id}`, { token })).data.notes.length, 2);

    await call('/notes/batch', { method: 'POST', token, body: { ids: [ids[2]], action: 'archive' } });
    await call('/notes/batch', { method: 'POST', token, body: { ids: [ids[3]], action: 'delete' } });
    const f = (await call('/folders', { token })).data;
    assert.equal(f.archivedCount, 1);
    assert.equal(f.trashCount, 1);

    assert.equal((await call('/notes/batch', { method: 'POST', token, body: { ids: [], action: 'delete' } })).status, 400);
    assert.equal((await call('/notes/batch', { method: 'POST', token, body: { ids: [ids[0]], action: 'explodir' } })).status, 400);
  });

  test('arrumar mural organiza em grade, fixados primeiro', async () => {
    const f = (await call('/folders', { method: 'POST', token, body: { name: 'Bagunça' } })).data.folder;
    const created = [];
    for (const [title, x, y] of [['c', 900, 700], ['a', 10, 10], ['b', 500, 20]]) {
      created.push((await call('/notes', { method: 'POST', token, body: { title, x, y, folderId: f.id } })).data.note);
    }
    await call(`/notes/${created[0].id}/pin`, { method: 'POST', token, body: { pinned: true } });
    const r = await call('/notes/arrange', { method: 'POST', token, body: { folderId: f.id, columns: 2 } });
    const byTitle = Object.fromEntries(r.data.notes.map((n) => [n.title, n]));
    assert.deepEqual([byTitle.c.x, byTitle.c.y], [40, 40]); // fixado vai para o 1º lugar (o mural já começa abaixo da barra do topo)
    assert.equal(byTitle.a.y, 40); // mesma linha
    assert.ok(byTitle.a.x > byTitle.c.x);
    assert.ok(byTitle.b.y > 40); // segunda linha
  });

  test('outro usuário não consegue usar lote nos meus post-its', async () => {
    const mine = (await call('/notes', { method: 'POST', token, body: { title: 'meu' } })).data.note;
    const other = await newUser();
    const r = await call('/notes/batch', { method: 'POST', token: other.token, body: { ids: [mine.id], action: 'delete' } });
    assert.match(r.data.message, /^0 post-its/);
    assert.ok((await call('/notes', { token })).data.notes.some((n) => n.id === mine.id));
  });
});

// ---------------------------------------------------------------------------
describe('Foto do post-it', () => {
  // PNG de 1x1 pixel
  const PNG =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  let token;
  before(async () => ({ token } = await newUser()));

  test('enviar, ler, duplicar com foto e remover', async () => {
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'Receita' } })).data.note;
    const up = await call(`/notes/${n.id}/image`, { method: 'PUT', token, body: { dataUrl: PNG } });
    assert.equal(up.status, 200);
    assert.equal(up.data.note.hasImage, true);

    const res = await fetch(`${BASE}/notes/${n.id}/image`, { headers: { Authorization: `Bearer ${token}` } });
    assert.equal(res.headers.get('content-type'), 'image/png');
    assert.equal(res.headers.get('cache-control'), 'no-store'); // navegador não guarda a foto
    assert.equal((await fetch(`${BASE}/notes/${n.id}/image`)).status, 401); // sem login não vê
    assert.equal((await res.arrayBuffer()).byteLength > 50, true);

    const copy = (await call(`/notes/${n.id}/duplicate`, { method: 'POST', token })).data.note;
    assert.equal(copy.hasImage, true);

    await call(`/notes/${n.id}/image`, { method: 'DELETE', token });
    assert.equal((await call(`/notes/${n.id}/image`, { token })).status, 404);
  });

  test('recusa arquivo que não é imagem e foto de outro usuário', async () => {
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'X' } })).data.note;
    const fake = 'data:image/png;base64,' + Buffer.from('isso não é uma imagem').toString('base64');
    assert.equal((await call(`/notes/${n.id}/image`, { method: 'PUT', token, body: { dataUrl: fake } })).status, 400);
    assert.equal((await call(`/notes/${n.id}/image`, { method: 'PUT', token, body: { dataUrl: 'data:text/html;base64,PGI+' } })).status, 400);

    await call(`/notes/${n.id}/image`, { method: 'PUT', token, body: { dataUrl: PNG } });
    const other = await newUser();
    assert.equal((await call(`/notes/${n.id}/image`, { token: other.token })).status, 404);
  });
});

// ---------------------------------------------------------------------------
describe('Subpastas, cor e ordem das pastas', () => {
  let token;
  before(async () => ({ token } = await newUser()));
  const mk = async (body) => (await call('/folders', { method: 'POST', token, body })).data;

  test('cria subpastas até 3 níveis, sem ciclos', async () => {
    const facul = (await mk({ name: 'Faculdade', color: 'blue' })).folder;
    assert.equal(facul.color, 'blue');
    const calc = (await mk({ name: 'Cálculo', parentId: facul.id })).folder;
    const provas = (await mk({ name: 'Provas', parentId: calc.id })).folder;
    assert.equal(calc.parentId, facul.id);
    assert.equal(provas.parentId, calc.id);

    const tooDeep = await call('/folders', { method: 'POST', token, body: { name: 'Nível 4', parentId: provas.id } });
    assert.equal(tooDeep.status, 400);
    // pôr Faculdade dentro da própria subpasta = ciclo
    assert.equal((await call(`/folders/${facul.id}`, { method: 'PUT', token, body: { name: 'Faculdade', parentId: calc.id } })).status, 400);
    // mesmo nome pode existir em lugares diferentes, mas não no mesmo nível
    assert.equal((await mk({ name: 'Provas', parentId: facul.id })).folder.name, 'Provas');
    assert.equal((await call('/folders', { method: 'POST', token, body: { name: 'provas', parentId: calc.id } })).status, 409);
    // renomear sem mandar parentId não muda o lugar
    const ren = await call(`/folders/${calc.id}`, { method: 'PUT', token, body: { name: 'Cálculo II', color: 'pink' } });
    assert.equal(ren.data.folder.parentId, facul.id);
    assert.equal(ren.data.folder.color, 'pink');
  });

  test('reordenar e apagar pasta com subpastas (sobem um nível)', async () => {
    const a = (await mk({ name: 'A' })).folder;
    const b = (await mk({ name: 'B' })).folder;
    const all = (await call('/folders', { token })).data.folders.filter((f) => f.parentId === null);
    const ids = all.map((f) => f.id).reverse();
    const r = await call('/folders/order', { method: 'PUT', token, body: { parentId: null, ids } });
    assert.equal(r.status, 200);
    const after = r.data.folders.filter((f) => f.parentId === null).sort((x, y) => x.position - y.position);
    assert.deepEqual(after.map((f) => f.id), ids);
    assert.equal((await call('/folders/order', { method: 'PUT', token, body: { parentId: null, ids: [a.id] } })).status, 400);

    const child = (await mk({ name: 'Filha', parentId: b.id })).folder;
    const n = (await call('/notes', { method: 'POST', token, body: { title: 'na B', folderId: b.id } })).data.note;
    await call(`/folders/${b.id}`, { method: 'DELETE', token });
    const list = (await call('/folders', { token })).data.folders;
    assert.equal(list.find((f) => f.id === child.id).parentId, null);
    assert.ok((await call('/notes?folder=root', { token })).data.notes.some((x) => x.id === n.id));
  });
});

// ---------------------------------------------------------------------------
describe('Pasta compartilhada', () => {
  let ana, beto, intruso, folder;
  before(async () => {
    ana = await newUser('Ana');
    beto = await newUser('Beto');
    intruso = await newUser('Intruso');
    folder = (await call('/folders', { method: 'POST', token: ana.token, body: { name: 'Viagem para o Rio', icon: '✈️' } })).data.folder;
  });

  test('convidar por e-mail (e erros de convite)', async () => {
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: ana.token, body: { email: 'ninguem@x.dev' } })).status, 404);
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: ana.token, body: { email: ana.email } })).status, 400);
    // convidado não pode convidar
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: beto.token, body: { email: beto.email } })).status, 404);

    const r = await call(`/folders/${folder.id}/members`, { method: 'POST', token: ana.token, body: { email: beto.email.toUpperCase() } });
    assert.equal(r.status, 201);
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: ana.token, body: { email: beto.email } })).status, 409);

    const shared = (await call('/folders', { token: beto.token })).data.shared;
    assert.equal(shared[0].name, 'Viagem para o Rio');
    assert.equal(shared[0].ownerName, 'Ana');

    // convidado vê nomes, mas não os e-mails
    const m = (await call(`/folders/${folder.id}/members`, { token: beto.token })).data;
    assert.equal(m.role, 'member');
    assert.equal(m.owner.name, 'Ana');
    assert.ok(!('email' in m.owner));
  });

  test('convidado cria, edita e exclui post-its na pasta; o dono vê tudo', async () => {
    const n = (await call('/notes', { method: 'POST', token: beto.token, body: { title: 'Reservar hotel', folderId: folder.id } })).data.note;
    assert.equal(n.ownerId, ana.user.id); // fica com a dona da pasta
    assert.equal(n.createdBy, beto.user.id);
    assert.ok((await call(`/notes?folder=${folder.id}`, { token: ana.token })).data.notes.some((x) => x.id === n.id));

    assert.equal((await call(`/notes/${n.id}`, { method: 'PUT', token: beto.token, body: { title: 'Reservar hotel em Copacabana' } })).status, 200);
    assert.equal((await call(`/notes/${n.id}/position`, { method: 'PATCH', token: beto.token, body: { x: 300, y: 300 } })).status, 200);

    // busca do convidado acha post-its da pasta compartilhada
    const s = await call('/notes/search?q=copacabana', { token: beto.token });
    assert.equal(s.data.results[0].sharedBy, 'Ana');

    // excluir vai para a lixeira da dona; o convidado ainda consegue desfazer
    await call(`/notes/${n.id}`, { method: 'DELETE', token: beto.token });
    assert.ok((await call('/notes/trash', { token: ana.token })).data.notes.some((x) => x.id === n.id));
    assert.equal((await call(`/notes/${n.id}/restore`, { method: 'POST', token: beto.token })).status, 200);
  });

  test('convidado não mexe na pasta em si nem leva post-its embora; intruso não vê nada', async () => {
    const n = (await call('/notes', { method: 'POST', token: ana.token, body: { title: 'Roteiro', folderId: folder.id } })).data.note;
    assert.equal((await call(`/folders/${folder.id}`, { method: 'PUT', token: beto.token, body: { name: 'Minha agora' } })).status, 404);
    assert.equal((await call(`/folders/${folder.id}`, { method: 'DELETE', token: beto.token })).status, 404);
    // mover para o Mural geral do Beto = outra dona → recusado
    assert.equal((await call(`/notes/${n.id}/folder`, { method: 'PATCH', token: beto.token, body: { folderId: null } })).status, 403);

    assert.equal((await call(`/notes?folder=${folder.id}`, { token: intruso.token })).status, 404);
    assert.equal((await call(`/notes/${n.id}`, { method: 'PUT', token: intruso.token, body: { title: 'x' } })).status, 404);
    assert.equal((await call(`/notes/${n.id}/image`, { token: intruso.token })).status, 404);
    assert.equal((await call(`/live/folders/${folder.id}/cursor`, { method: 'POST', token: intruso.token, body: { x: 1, y: 1 } })).status, 404);
  });

  test('ao vivo: presença, cursor e aviso de mudança entre duas pessoas', async () => {
    // abre o "ao vivo" como o navegador faz (fetch com Authorization, lendo o fluxo)
    async function connect(token) {
      const ctrl = new AbortController();
      const res = await fetch(`${BASE}/live/folders/${folder.id}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
      assert.equal(res.headers.get('content-type'), 'text/event-stream; charset=utf-8');
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = '';
      const queue = [];
      (async () => {
        try {
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) !== -1) {
              const raw = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const ev = /^event: (.+)$/m.exec(raw)?.[1];
              const data = /^data: (.+)$/m.exec(raw)?.[1];
              if (ev) queue.push({ ev, data: JSON.parse(data) });
            }
          }
        } catch {}
      })();
      const next = async (name, ms = 3000) => {
        const until = Date.now() + ms;
        while (Date.now() < until) {
          const idx = queue.findIndex((e) => e.ev === name);
          if (idx !== -1) return queue.splice(idx, 1)[0].data;
          await new Promise((r) => setTimeout(r, 20));
        }
        throw new Error(`não chegou o evento "${name}"`);
      };
      return { next, close: () => ctrl.abort() };
    }

    const a = await connect(ana.token);
    assert.equal((await a.next('hello')).presence.length, 1);
    const b = await connect(beto.token);
    const hb = await b.next('hello');
    assert.equal(hb.presence.length, 2);
    assert.deepEqual((await a.next('presence')).presence.map((p) => p.name).sort(), ['Ana', 'Beto']);

    // cursor do Beto chega para a Ana (e não volta para ele mesmo)
    await call(`/live/folders/${folder.id}/cursor`, { method: 'POST', token: beto.token, body: { x: 420, y: 230 } });
    const cur = await a.next('cursor');
    assert.deepEqual([cur.name, cur.x, cur.y], ['Beto', 420, 230]);

    // Beto cria um post-it → Ana recebe aviso para recarregar
    await call('/notes', { method: 'POST', token: beto.token, body: { title: 'Comprar protetor', folderId: folder.id } });
    assert.equal((await a.next('notes')).by, beto.user.id);

    // Beto sai da pasta → conexão dele fecha e ele perde o acesso
    b.close();
    assert.equal((await a.next('cursor-leave')).userId, beto.user.id);
    await call(`/folders/${folder.id}/members/${beto.user.id}`, { method: 'DELETE', token: beto.token });
    assert.equal((await call(`/notes?folder=${folder.id}`, { token: beto.token })).status, 404);
    a.close();
  });
});

// ---------------------------------------------------------------------------
describe('Lembretes com horário, aviso antecipado e calendário', () => {
  let token;
  before(async () => ({ token } = await newUser()));

  test('valida horário, aviso e repetição', async () => {
    for (const extra of [{ eventTime: '25:00' }, { eventTime: '9h' }, { remindBefore: 7 }, { repeat: 'diario' }]) {
      const r = await call('/notes', { method: 'POST', token, body: { title: 'x', eventDate: today(), eventType: 'event', ...extra } });
      assert.equal(r.status, 400, JSON.stringify(extra));
    }
    const ok = await call('/notes', {
      method: 'POST',
      token,
      body: { title: 'Aluguel', eventDate: today(), eventType: 'reminder', eventTime: '09:30', remindBefore: 1440, repeat: 'monthly' },
    });
    assert.equal(ok.data.note.eventTime, '09:30');
    assert.equal(ok.data.note.repeat, 'monthly');
    // aniversário sempre anual, mesmo pedindo outra coisa
    const b = await call('/notes', { method: 'POST', token, body: { title: 'Niver', eventDate: '2000-03-10', eventType: 'birthday', repeat: 'weekly' } });
    assert.equal(b.data.note.repeat, 'yearly');
  });

  test('alertas: "chegou a hora", "aviso antecipado" e fechar cada etapa', async () => {
    const due = (await call('/notes', { method: 'POST', token, body: { title: 'Já passou da hora', eventDate: today(), eventType: 'event', eventTime: '00:00' } })).data.note;
    const soon = (await call('/notes', { method: 'POST', token, body: { title: 'Amanhã cedo', eventDate: addDays(today(), 1), eventType: 'event', eventTime: '08:00', remindBefore: 2880 } })).data.note;
    const later = (await call('/notes', { method: 'POST', token, body: { title: 'Daqui a 3 dias', eventDate: addDays(today(), 3), eventType: 'event', eventTime: '10:00' } })).data.note;

    let r = (await call('/alerts', { token })).data;
    const dueAlert = r.alerts.find((n) => n.id === due.id);
    const soonAlert = r.alerts.find((n) => n.id === soon.id);
    assert.equal(dueAlert.alertStage, 'due');
    assert.equal(soonAlert.alertStage, 'soon');
    assert.ok(soonAlert.minutesUntil > 0);
    assert.ok(r.upcoming.some((n) => n.id === later.id));
    assert.ok(!r.alerts.some((n) => n.id === later.id));

    await call(`/alerts/${soon.id}/dismiss`, { method: 'POST', token, body: { key: soonAlert.alertKey } });
    r = (await call('/alerts', { token })).data;
    assert.ok(!r.alerts.some((n) => n.id === soon.id));
    assert.equal((await call(`/alerts/${soon.id}/dismiss`, { method: 'POST', token, body: { key: 'qualquer' } })).status, 400);
  });

  test('calendário do mês mostra as ocorrências, inclusive repetidas', async () => {
    const month = today().slice(0, 7);
    const first = `${month}-01`;
    await call('/notes', { method: 'POST', token, body: { title: 'Toda semana', eventDate: first, eventType: 'reminder', repeat: 'weekly', color: 'green' } });
    const r = (await call(`/calendar?month=${month}`, { token })).data;
    const days = Object.entries(r.days).filter(([, list]) => list.some((n) => n.title === 'Toda semana')).map(([d]) => d);
    assert.ok(days.length >= 4 && days.length <= 5);
    assert.ok(days.every((d) => d.startsWith(month)));
    assert.equal((await call('/calendar?month=2026-13', { token })).status, 400);
  });
});

// ---------------------------------------------------------------------------
describe('Busca com filtros e por data', () => {
  let token, folder;
  before(async () => {
    ({ token } = await newUser());
    folder = (await call('/folders', { method: 'POST', token, body: { name: 'Trabalho' } })).data.folder;
    await call('/notes', { method: 'POST', token, body: { title: 'Relatório', color: 'blue', tags: ['urgente'], folderId: folder.id } });
    await call('/notes', { method: 'POST', token, body: { title: 'Relatório pessoal', color: 'pink' } });
    await call('/notes', { method: 'POST', token, body: { title: 'Natal', eventDate: '2026-12-25', eventType: 'event', color: 'green' } });
    await call('/notes', { method: 'POST', token, body: { title: 'Niver Bia', eventDate: '1999-12-03', eventType: 'birthday' } });
  });
  const s = async (qs) => (await call(`/notes/search?${qs}`, { token })).data;

  test('filtros por cor, pasta, etiqueta e "só com data" (com ou sem texto)', async () => {
    assert.deepEqual((await s('q=relatorio&color=blue')).results.map((n) => n.title), ['Relatório']);
    assert.deepEqual((await s(`q=relatorio&folder=${folder.id}`)).results.map((n) => n.title), ['Relatório']);
    assert.deepEqual((await s('q=relatorio&folder=root')).results.map((n) => n.title), ['Relatório pessoal']);
    assert.deepEqual((await s('tag=urgente')).results.map((n) => n.title), ['Relatório']);
    assert.deepEqual((await s('hasDate=1')).results.map((n) => n.title).sort(), ['Natal', 'Niver Bia']);
    assert.deepEqual((await call('/notes/tags', { token })).data.tags, [{ tag: 'urgente', uses: 1 }]);
  });

  test('busca por "dezembro" e por "25/12" (conta aniversário que repete)', async () => {
    const dez = await s('q=dezembro');
    assert.equal(dez.dateLabel, `dezembro de ${today().slice(0, 4)}`);
    assert.deepEqual(dez.results.map((n) => n.title).sort(), ['Natal', 'Niver Bia']);
    assert.deepEqual((await s(`q=${encodeURIComponent('25/12/2026')}`)).results.map((n) => n.title), ['Natal']);
    assert.deepEqual((await s('q=niver%20dezembro')).results.map((n) => n.title), ['Niver Bia']);
  });
});

// ---------------------------------------------------------------------------
describe('Sessão em cookie seguro, limite de tentativas e senha', () => {
  const PASS = 'senha-forte-1';
  const cookieOf = (res) => res.headers.get('set-cookie') ?? '';

  test('no navegador a sessão vai num cookie httpOnly (o token não aparece no corpo)', async () => {
    const u = await newUser();
    const r = await call('/auth/login', { method: 'POST', headers: { 'X-Mural': '1', 'X-Forwarded-Proto': 'https' }, body: { email: u.email, password: PASS } });
    assert.equal(r.status, 200);
    assert.ok(!('token' in r.data));
    const c = cookieOf(r);
    assert.match(c, /mural_session=/);
    assert.match(c, /HttpOnly/i);
    assert.match(c, /Secure/i);
    assert.match(c, /SameSite=Lax/i);
    const cookie = c.split(';')[0];

    assert.equal((await call('/auth/me', { headers: { Cookie: cookie } })).status, 200);
    // mudança com cookie mas sem o cabeçalho X-Mural = bloqueada (proteção CSRF)
    assert.equal((await call('/notes', { method: 'POST', headers: { Cookie: cookie }, body: { title: 'x' } })).status, 403);
    assert.equal((await call('/notes', { method: 'POST', headers: { Cookie: cookie, 'X-Mural': '1' }, body: { title: 'ok' } })).status, 201);

    // sair apaga o cookie e invalida a sessão
    const out = await call('/auth/logout', { method: 'POST', headers: { Cookie: cookie, 'X-Mural': '1' } });
    assert.match(cookieOf(out), /mural_session=;/);
    assert.equal((await call('/auth/me', { headers: { Cookie: cookie } })).status, 401);
  });

  test('token antigo (localStorage) vira cookie uma vez só', async () => {
    const u = await newUser();
    const r = await call('/auth/cookie', { method: 'POST', token: u.token });
    assert.match(cookieOf(r), /mural_session=/);
    assert.equal((await call('/auth/me', { token: u.token })).status, 401); // o antigo morreu
  });

  test('muitas senhas erradas bloqueiam por um tempo', async () => {
    const u = await newUser();
    const headers = { 'X-Forwarded-For': '10.200.0.7' };
    let last;
    for (let i = 0; i < 9; i++) last = await call('/auth/login', { method: 'POST', headers, body: { email: u.email, password: 'errada' } });
    assert.equal(last.status, 429);
    // até a senha certa espera o bloqueio passar (mesmo IP + e-mail)
    assert.equal((await call('/auth/login', { method: 'POST', headers, body: { email: u.email, password: PASS } })).status, 429);
    // de outro lugar, funciona
    assert.equal((await call('/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': '10.200.0.8' }, body: { email: u.email, password: PASS } })).status, 200);
  });

  test('trocar senha derruba as outras sessões', async () => {
    const u = await newUser();
    const other = (await call('/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': '10.201.0.1' }, body: { email: u.email, password: PASS } })).data.token;
    assert.equal((await call('/auth/password', { method: 'POST', token: u.token, body: { current: 'errada', password: 'nova-senha-123' } })).status, 401);
    assert.equal((await call('/auth/password', { method: 'POST', token: u.token, body: { current: PASS, password: 'nova-senha-123' } })).status, 200);
    assert.equal((await call('/auth/me', { token: u.token })).status, 200); // a atual continua
    assert.equal((await call('/auth/me', { token: other })).status, 401); // a outra caiu
    assert.equal((await call('/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': '10.201.0.2' }, body: { email: u.email, password: 'nova-senha-123' } })).status, 200);
  });

  test('esqueci minha senha (pronto no servidor, desligado na tela por enquanto)', async () => {
    const u = await newUser();
    const ghost = await call('/auth/forgot', { method: 'POST', headers: { 'X-Forwarded-For': '10.202.0.1' }, body: { email: 'ninguem@x.dev' } });
    const real = await call('/auth/forgot', { method: 'POST', headers: { 'X-Forwarded-For': '10.202.0.1' }, body: { email: u.email } });
    assert.equal(ghost.data.message, real.data.message); // não revela quem tem conta
    const code = new URL(real.data.devLink).searchParams.get('codigo');
    assert.equal((await call('/auth/reset', { method: 'POST', body: { token: code, password: '123' } })).status, 400);
    assert.equal((await call('/auth/reset', { method: 'POST', body: { token: code, password: 'outra-senha-9' } })).status, 200);
    assert.equal((await call('/auth/reset', { method: 'POST', body: { token: code, password: 'outra-senha-9' } })).status, 400); // uma vez só
    assert.equal((await call('/auth/me', { token: u.token })).status, 401); // sessões antigas caíram
  });
});

// ---------------------------------------------------------------------------
describe('Backup, importar e excluir conta (LGPD)', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  test('exportar tudo e importar em outra conta', async () => {
    const a = await newUser('Dona do backup');
    const f = (await call('/folders', { method: 'POST', token: a.token, body: { name: 'Senhas e contas', icon: '🧠' } })).data.folder;
    const sub = (await call('/folders', { method: 'POST', token: a.token, body: { name: 'Banco', parentId: f.id } })).data.folder;
    const n = (await call('/notes', { method: 'POST', token: a.token, body: { title: 'Wi-Fi de casa', content: 'rede: Casa', folderId: sub.id, checklist: [{ text: 'trocar senha' }], tags: ['casa'], eventDate: '2026-12-01', eventType: 'reminder', eventTime: '09:00', repeat: 'monthly' } })).data.note;
    await call(`/notes/${n.id}/image`, { method: 'PUT', token: a.token, body: { dataUrl: PNG } });
    const arch = (await call('/notes', { method: 'POST', token: a.token, body: { title: 'Velho' } })).data.note;
    await call(`/notes/${arch.id}/archive`, { method: 'POST', token: a.token, body: { archived: true } });
    const trash = (await call('/notes', { method: 'POST', token: a.token, body: { title: 'Lixo' } })).data.note;
    await call(`/notes/${trash.id}`, { method: 'DELETE', token: a.token });

    const res = await fetch(`${BASE}/account/export`, { headers: { Authorization: `Bearer ${a.token}` } });
    assert.match(res.headers.get('content-disposition'), /attachment; filename="mural-de-notas-backup-/);
    const backup = await res.json();
    assert.equal(backup.app, 'mural-de-notas');
    assert.equal(backup.folders.length, 2);
    assert.equal(backup.notes.length, 3);
    const wifi = backup.notes.find((x) => x.title === 'Wi-Fi de casa');
    assert.match(wifi.image, /^data:image\/png;base64,/);
    assert.equal(wifi.repeat, 'monthly');

    const b = await newUser('Conta nova');
    const imp = await call('/account/import', { method: 'POST', token: b.token, body: { backup } });
    assert.equal(imp.status, 200, JSON.stringify(imp.data));
    assert.equal(imp.data.imported, 2); // lixeira não volta
    assert.equal(imp.data.folders, 2);
    const folders = (await call('/folders', { token: b.token })).data.folders;
    const banco = folders.find((x) => x.name === 'Banco');
    assert.ok(banco.parentId, 'subpasta continua subpasta');
    const notes = (await call(`/notes?folder=${banco.id}`, { token: b.token })).data.notes;
    assert.equal(notes[0].title, 'Wi-Fi de casa');
    assert.equal(notes[0].hasImage, true);
    assert.equal(notes[0].eventTime, '09:00');
    assert.equal((await call('/notes/archived', { token: b.token })).data.notes[0].title, 'Velho');

    assert.equal((await call('/account/import', { method: 'POST', token: b.token, body: { backup: { app: 'outro' } } })).status, 400);
  });

  test('excluir conta: pede a senha, some na hora e volta se entrar em 30 dias', async () => {
    const u = await newUser('Vai e volta');
    const n = (await call('/notes', { method: 'POST', token: u.token, body: { title: 'Não quero perder' } })).data.note;
    const f = (await call('/folders', { method: 'POST', token: u.token, body: { name: 'Compartilhada' } })).data.folder;
    const friend = await newUser('Amiga');
    await call(`/folders/${f.id}/members`, { method: 'POST', token: u.token, body: { email: friend.email } });

    assert.equal((await call('/account', { method: 'DELETE', token: u.token, body: { password: 'errada' } })).status, 401);
    const del = await call('/account', { method: 'DELETE', token: u.token, body: { password: 'senha-forte-1' } });
    assert.equal(del.status, 200);
    assert.equal(del.data.graceDays, 30);
    assert.equal((await call('/auth/me', { token: u.token })).status, 401); // saiu de todo lugar
    // ninguém consegue convidar a conta em exclusão
    const fx = (await call('/folders', { method: 'POST', token: friend.token, body: { name: 'Da amiga' } })).data.folder;
    assert.equal((await call(`/folders/${fx.id}/members`, { method: 'POST', token: friend.token, body: { email: u.email } })).status, 404);

    // entrou de novo dentro do prazo: tudo volta
    const back = await call('/auth/login', { method: 'POST', headers: { 'X-Forwarded-For': '10.203.0.1' }, body: { email: u.email, password: 'senha-forte-1' } });
    assert.equal(back.status, 200);
    assert.match(back.data.message, /recuperad/);
    assert.ok((await call('/notes', { token: back.data.token })).data.notes.some((x) => x.id === n.id));
  });

  test('backup automático do banco foi criado ao iniciar', () => {
    const dir = path.join(dbDir, 'backups');
    const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.db')) : [];
    assert.ok(files.length >= 1, 'deveria existir pelo menos 1 backup');
    assert.ok(fs.statSync(path.join(dir, files[0])).size > 1000);
  });

  test('novas configurações de aparência são validadas', async () => {
    const u = await newUser();
    const ok = await call('/settings', { method: 'PUT', token: u.token, body: { theme: 'light', fontScale: 1.3, highContrast: true, sounds: true, soundVolume: 0.3, showFocusTimer: true, focusMinutes: 50, breakMinutes: 10 } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.settings.theme, 'light');
    for (const body of [{ theme: 'rosa' }, { fontScale: 3 }, { sounds: 'sim' }, { focusMinutes: 7 }]) {
      assert.equal((await call('/settings', { method: 'PUT', token: u.token, body })).status, 400, JSON.stringify(body));
    }
  });
});

// ---------------------------------------------------------------------------
describe('Robustez e segurança básica', () => {
  test('rota inexistente e JSON quebrado respondem com erro amigável', async () => {
    const nf = await call('/nao-existe');
    assert.equal(nf.status, 404);
    assert.ok(nf.data.error);
    const bad = await call('/auth/login', { method: 'POST', raw: '{"email": ' });
    assert.equal(bad.status, 400);
  });

  test('CORS só libera o front e a rede local', async () => {
    const lan = await call('/health', { headers: { Origin: 'https://192.168.0.15:3000' } });
    assert.equal(lan.headers.get('access-control-allow-origin'), 'https://192.168.0.15:3000');
    const evil = await call('/health', { headers: { Origin: 'https://site-malicioso.com' } });
    assert.equal(evil.headers.get('access-control-allow-origin'), null);
  });

  test('clima recusa coordenadas inválidas', async () => {
    assert.equal((await call('/weather?lat=999&lon=0')).status, 400);
    assert.equal((await call('/weather?lat=abc&lon=1')).status, 400);
  });
});

describe('Convidar pelo ID da pessoa', () => {
  const CODE_RE = /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/;
  let dona, amigo, folder;

  before(async () => {
    dona = await newUser('Carla');
    amigo = await newUser('Davi');
    folder = (await call('/folders', { method: 'POST', token: dona.token, body: { name: 'Projeto TCC', icon: '📚' } })).data.folder;
  });

  test('cada conta nasce com um ID próprio, que aparece no perfil', async () => {
    assert.match(dona.user.code, CODE_RE);
    assert.match(amigo.user.code, CODE_RE);
    assert.notEqual(dona.user.code, amigo.user.code);
    const me = (await call('/auth/me', { token: dona.token })).data.user;
    assert.equal(me.code, dona.user.code);
  });

  test('convida pelo ID mesmo colado em minúsculas, sem hífen ou com espaços', async () => {
    const colado = ` ${amigo.user.code.replace('-', '').toLowerCase()} `;
    const r = await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: colado } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.member.name, 'Davi');
    assert.equal(r.data.member.code, amigo.user.code);
    assert.ok(!('email' in r.data.member), 'quem convidou pelo ID não recebe o e-mail');

    const shared = (await call('/folders', { token: amigo.token })).data.shared;
    assert.ok(shared.some((f) => f.id === folder.id));
    // de novo: já participa
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: amigo.user.code } })).status, 409);
  });

  test('ID inválido, inexistente ou o próprio ID dão mensagens claras', async () => {
    const r1 = await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: 'abc' } });
    assert.equal(r1.status, 400);
    assert.match(r1.data.error, /ID/);
    // formato certo, mas ninguém tem (o alfabeto não tem 0, O, 1, I nem L)
    const fake = dona.user.code === 'ZZZZ-ZZZZ' ? 'YYYY-YYYY' : 'ZZZZ-ZZZZ';
    const r2 = await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: fake } });
    assert.equal(r2.status, 404);
    assert.match(r2.data.error, /ID/);
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: dona.user.code } })).status, 400);
    // e-mail no mesmo campo continua valendo
    const outro = await newUser('Eva');
    assert.equal((await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: outro.email } })).status, 201);
  });

  test('lista de participantes mostra nome e ID, nunca o e-mail (nem para a dona)', async () => {
    for (const token of [dona.token, amigo.token]) {
      const m = (await call(`/folders/${folder.id}/members`, { token })).data;
      assert.equal(m.owner.code, dona.user.code);
      assert.ok(!('email' in m.owner));
      for (const p of m.members) {
        assert.match(p.code, CODE_RE);
        assert.ok(!('email' in p));
      }
    }
  });
});

describe('Trabalho em grupo: edição ao mesmo tempo, lembretes, lixeira e backup', () => {
  let dona, colega, outro, folder, note;
  const ymdIn = (days) => addDays(today(), days);

  before(async () => {
    dona = await newUser('Helena');
    colega = await newUser('Igor');
    outro = await newUser('Júlia');
    folder = (await call('/folders', { method: 'POST', token: dona.token, body: { name: 'Seminário', icon: '🎓' } })).data.folder;
    await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: colega.user.code } });
    note = (
      await call('/notes', {
        method: 'POST',
        token: dona.token,
        body: { title: 'Roteiro', content: 'Parte 1: Helena', folderId: folder.id, checklist: [{ text: 'Slides' }, { text: 'Ensaiar' }] },
      })
    ).data.note;
  });

  test('cada mudança de conteúdo sobe a versão do post-it e guarda quem mudou', async () => {
    assert.equal(note.version, 1);
    const r = await call(`/notes/${note.id}`, { method: 'PUT', token: colega.token, body: { ...note, content: 'Parte 1: Helena · Parte 2: Igor', baseVersion: 1 } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.note.version, 2);
    assert.equal(r.data.note.updatedBy, colega.user.id);
    const t = await call(`/notes/${note.id}/checklist/${note.checklist[0].id}`, { method: 'PATCH', token: dona.token, body: { done: true } });
    assert.equal(t.data.note.version, 3, 'marcar item da checklist também conta como mudança');
    // arrastar não muda a versão (não conflita com quem está editando o texto)
    const m = await call(`/notes/${note.id}/position`, { method: 'PATCH', token: colega.token, body: { x: 10, y: 10 } });
    assert.equal(m.data.note.version, 3);
  });

  test('salvar uma cópia velha é recusado (409) com a versão atual e quem mudou', async () => {
    // o Igor abriu na versão 2 e a Helena marcou a checklist (versão 3): ele salva a cópia dele
    const stale = await call(`/notes/${note.id}`, { method: 'PUT', token: colega.token, body: { ...note, title: 'Roteiro final', baseVersion: 2 } });
    assert.equal(stale.status, 409);
    assert.match(stale.data.error, /Helena mudou este post-it/);
    assert.equal(stale.data.conflict.by, 'Helena');
    assert.equal(stale.data.conflict.note.version, 3);
    assert.equal(stale.data.conflict.note.checklist[0].done, true);
    // nada foi apagado
    const now = (await call(`/notes?folder=${folder.id}`, { token: dona.token })).data.notes.find((n) => n.id === note.id);
    assert.equal(now.title, 'Roteiro');
    assert.equal(now.checklist[0].done, true);
  });

  test('"salvar a minha mesmo assim" (force) e quem não manda versão continuam funcionando', async () => {
    const forced = await call(`/notes/${note.id}`, { method: 'PUT', token: colega.token, body: { ...note, title: 'Roteiro do Igor', baseVersion: 2, force: true } });
    assert.equal(forced.status, 200);
    assert.equal(forced.data.note.title, 'Roteiro do Igor');
    const legacy = await call(`/notes/${note.id}`, { method: 'PUT', token: dona.token, body: { ...note, title: 'Roteiro' } });
    assert.equal(legacy.status, 200, 'sem baseVersion = como antes (sem checagem)');
  });

  test('conflito consigo mesmo (outra aba) tem mensagem própria', async () => {
    const cur = (await call(`/notes?folder=${folder.id}`, { token: dona.token })).data.notes.find((n) => n.id === note.id);
    await call(`/notes/${note.id}`, { method: 'PUT', token: dona.token, body: { ...cur, content: 'aba 1', baseVersion: cur.version } });
    const r = await call(`/notes/${note.id}`, { method: 'PUT', token: dona.token, body: { ...cur, content: 'aba 2', baseVersion: cur.version } });
    assert.equal(r.status, 409);
    assert.equal(r.data.conflict.mine, true);
    assert.match(r.data.error, /outra aba/);
  });

  test('lembretes da pasta do grupo chegam para quem participa, e cada um fecha o seu', async () => {
    const reuniao = (
      await call('/notes', { method: 'POST', token: colega.token, body: { title: 'Reunião do grupo', folderId: folder.id, eventDate: ymdIn(0), eventType: 'event' } })
    ).data.note;
    const alertsIgor = (await call('/alerts', { token: colega.token })).data.alerts;
    const a = alertsIgor.find((x) => x.id === reuniao.id);
    assert.ok(a, 'o convidado recebe o aviso');
    assert.ok(!(await call('/alerts', { token: outro.token })).data.alerts.some((x) => x.id === reuniao.id), 'quem não é do grupo não recebe');
    // Igor fecha: some só para ele
    assert.equal((await call(`/alerts/${reuniao.id}/dismiss`, { method: 'POST', token: colega.token, body: { key: a.alertKey } })).status, 200);
    assert.ok(!(await call('/alerts', { token: colega.token })).data.alerts.some((x) => x.id === reuniao.id));
    assert.ok((await call('/alerts', { token: dona.token })).data.alerts.some((x) => x.id === reuniao.id), 'continua para a dona');
    // quem não tem acesso não fecha
    assert.equal((await call(`/alerts/${reuniao.id}/dismiss`, { method: 'POST', token: outro.token, body: { key: a.alertKey } })).status, 404);
  });

  test('o que o convidado exclui aparece na lixeira DELE; ele restaura, mas só a dona apaga de vez', async () => {
    const extra = (await call('/notes', { method: 'POST', token: colega.token, body: { title: 'Rascunho do Igor', folderId: folder.id } })).data.note;
    await call(`/notes/${extra.id}`, { method: 'DELETE', token: colega.token });
    const trash = (await call('/notes/trash', { token: colega.token })).data.notes;
    const mine = trash.find((n) => n.id === extra.id);
    assert.ok(mine, 'aparece na lixeira de quem excluiu');
    assert.equal(mine.sharedTrash, true);
    assert.equal(mine.ownerName, 'Helena');
    assert.equal(mine.folderName, 'Seminário');
    assert.ok((await call('/notes/trash', { token: dona.token })).data.notes.some((n) => n.id === extra.id), 'e na da dona também');
    assert.equal((await call('/folders', { token: colega.token })).data.trashCount, 1);
    assert.equal((await call(`/notes/${extra.id}/permanent`, { method: 'DELETE', token: colega.token })).status, 404);
    assert.equal((await call(`/notes/${extra.id}/restore`, { method: 'POST', token: colega.token })).status, 200);
    assert.ok(!(await call('/notes/trash', { token: colega.token })).data.notes.some((n) => n.id === extra.id));
  });

  test('backup do convidado traz a pasta do grupo, e importar cria uma cópia', async () => {
    const backup = (await call('/account/export', { token: colega.token })).data;
    const groupFolder = backup.folders.find((f) => f.shared);
    assert.ok(groupFolder, 'a pasta do grupo está no backup');
    assert.equal(groupFolder.name, 'Seminário');
    assert.equal(groupFolder.ownerName, 'Helena');
    const groupNotes = backup.notes.filter((n) => n.folderId === groupFolder.id);
    assert.ok(groupNotes.some((n) => n.title.startsWith('Roteiro')));
    assert.ok(groupNotes.every((n) => n.fromGroup));
    // levar o backup para outra conta: vira uma pasta própria "(cópia do grupo)"
    const imp = await call('/account/import', { method: 'POST', token: outro.token, body: { backup } });
    assert.equal(imp.status, 200, JSON.stringify(imp.data));
    const copy = (await call('/folders', { token: outro.token })).data.folders.find((f) => f.name.includes('(cópia do grupo)'));
    assert.ok(copy);
    assert.ok((await call(`/notes?folder=${copy.id}`, { token: outro.token })).data.notes.some((n) => n.title.startsWith('Roteiro')));
  });
});

describe('Mural infinito: conexões entre post-its e organizar por assunto', () => {
  let dona, colega, estranho, folder, outra, a, b, c;
  const mk = (token, body) => call('/notes', { method: 'POST', token, body }).then((r) => r.data.note);

  before(async () => {
    dona = await newUser('Kátia');
    colega = await newUser('Leo');
    estranho = await newUser('Mário');
    folder = (await call('/folders', { method: 'POST', token: dona.token, body: { name: 'Mapa mental', icon: '🧠' } })).data.folder;
    outra = (await call('/folders', { method: 'POST', token: dona.token, body: { name: 'Outra pasta' } })).data.folder;
    await call(`/folders/${folder.id}/members`, { method: 'POST', token: dona.token, body: { who: colega.user.code } });
    a = await mk(dona.token, { title: 'Problema', folderId: folder.id, tags: ['ideia'] });
    b = await mk(dona.token, { title: 'Causa', folderId: folder.id, tags: ['ideia'] });
    c = await mk(dona.token, { title: 'Solução', folderId: folder.id, tags: ['plano'] });
  });

  test('ligar dois post-its: aparece para a dona e para o grupo', async () => {
    const r = await call('/links', { method: 'POST', token: dona.token, body: { fromId: a.id, toId: b.id } });
    assert.equal(r.status, 201, JSON.stringify(r.data));
    assert.equal(r.data.link.fromId, a.id);
    // o convidado também liga, e vê as duas
    assert.equal((await call('/links', { method: 'POST', token: colega.token, body: { fromId: b.id, toId: c.id } })).status, 201);
    const seen = (await call(`/links?folder=${folder.id}`, { token: colega.token })).data.links;
    assert.equal(seen.length, 2);
    // quem não é do grupo não vê nem liga
    assert.equal((await call(`/links?folder=${folder.id}`, { token: estranho.token })).status, 404);
    assert.equal((await call('/links', { method: 'POST', token: estranho.token, body: { fromId: a.id, toId: c.id } })).status, 404);
  });

  test('ligação repetida (inclusive ao contrário), consigo mesmo ou entre pastas é recusada', async () => {
    assert.equal((await call('/links', { method: 'POST', token: dona.token, body: { fromId: a.id, toId: b.id } })).status, 409);
    assert.equal((await call('/links', { method: 'POST', token: dona.token, body: { fromId: b.id, toId: a.id } })).status, 409);
    assert.equal((await call('/links', { method: 'POST', token: dona.token, body: { fromId: a.id, toId: a.id } })).status, 400);
    const longe = await mk(dona.token, { title: 'Em outra pasta', folderId: outra.id });
    const r = await call('/links', { method: 'POST', token: dona.token, body: { fromId: a.id, toId: longe.id } });
    assert.equal(r.status, 400);
    assert.match(r.data.error, /mesma pasta/);
  });

  test('post-it na lixeira esconde a seta; restaurar traz de volta; apagar de vez remove', async () => {
    await call(`/notes/${c.id}`, { method: 'DELETE', token: dona.token });
    let links = (await call(`/links?folder=${folder.id}`, { token: dona.token })).data.links;
    assert.equal(links.length, 1, 'a seta para o post-it excluído some');
    await call(`/notes/${c.id}/restore`, { method: 'POST', token: dona.token });
    links = (await call(`/links?folder=${folder.id}`, { token: dona.token })).data.links;
    assert.equal(links.length, 2, 'volta junto com o post-it');
    await call(`/notes/${c.id}`, { method: 'DELETE', token: dona.token });
    await call(`/notes/${c.id}/permanent`, { method: 'DELETE', token: dona.token });
    c = await mk(dona.token, { title: 'Solução', folderId: folder.id, tags: ['plano'] });
    links = (await call(`/links?folder=${folder.id}`, { token: dona.token })).data.links;
    assert.equal(links.length, 1, 'apagado de vez leva a seta junto');
  });

  test('remover uma conexão (dona ou grupo); estranho não remove', async () => {
    const r = await call('/links', { method: 'POST', token: dona.token, body: { fromId: b.id, toId: c.id } });
    assert.equal((await call(`/links/${r.data.link.id}`, { method: 'DELETE', token: estranho.token })).status, 404);
    assert.equal((await call(`/links/${r.data.link.id}`, { method: 'DELETE', token: colega.token })).status, 200);
    assert.equal((await call(`/links/${r.data.link.id}`, { method: 'DELETE', token: dona.token })).status, 404);
  });

  test('organizar por assunto junta pela primeira etiqueta e devolve os grupos', async () => {
    await mk(dona.token, { title: 'Ideia 3', folderId: folder.id, tags: ['ideia'] });
    await mk(dona.token, { title: 'Sem assunto', folderId: folder.id });
    const r = await call('/notes/arrange', { method: 'POST', token: colega.token, body: { folderId: folder.id, columns: 4, mode: 'subject' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.match(r.data.message, /1 assunto/);
    const subjects = r.data.groups.map((g) => g.subject);
    // #plano tem um post-it só: não vira bloco, vai para "outros" junto com o sem etiqueta
    assert.deepEqual(subjects, ['ideia', null], 'assunto com 2+ post-its vira bloco; o resto fica em "outros" no fim');
    assert.equal(r.data.groups[1].count, 2);
    const ideia = r.data.groups[0];
    const pos = Object.fromEntries(r.data.notes.map((n) => [n.title, n]));
    // os 3 de #ideia ficam dentro do bloco do grupo
    for (const t of ['Problema', 'Causa', 'Ideia 3']) {
      assert.ok(pos[t].x >= ideia.x && pos[t].x < ideia.x + ideia.width, `${t} dentro do bloco (x)`);
      assert.ok(pos[t].y >= ideia.y && pos[t].y < ideia.y + ideia.height, `${t} dentro do bloco (y)`);
    }
    // blocos não se sobrepõem
    const [g1, g2] = r.data.groups;
    const overlap = g1.x < g2.x + g2.width && g2.x < g1.x + g1.width && g1.y < g2.y + g2.height && g2.y < g1.y + g1.height;
    assert.ok(!overlap);
  });

  test('mural maior: posição até 50 mil px', async () => {
    const r = await call(`/notes/${a.id}/position`, { method: 'PATCH', token: dona.token, body: { x: 30000, y: 45000 } });
    assert.equal(r.data.note.x, 30000);
    assert.equal(r.data.note.y, 45000);
  });

  test('backup leva as setas e importar refaz as ligações', async () => {
    const backup = (await call('/account/export', { token: dona.token })).data;
    assert.ok(backup.links.length >= 1);
    const outroUser = await newUser('Nina');
    const imp = await call('/account/import', { method: 'POST', token: outroUser.token, body: { backup } });
    assert.equal(imp.status, 200, JSON.stringify(imp.data));
    assert.equal(imp.data.links, backup.links.length);
    const f = (await call('/folders', { token: outroUser.token })).data.folders.find((x) => x.name === 'Mapa mental');
    assert.equal((await call(`/links?folder=${f.id}`, { token: outroUser.token })).data.links.length, backup.links.length);
  });
});

describe('Quadro de detetive: cor dos fios, posições em lote e estilo', () => {
  let u, outro, folder, a, b, c;
  const mk = (token, body) => call('/notes', { method: 'POST', token, body }).then((r) => r.data.note);

  before(async () => {
    u = await newUser('Olga');
    outro = await newUser('Pedro');
    folder = (await call('/folders', { method: 'POST', token: u.token, body: { name: 'Investigação' } })).data.folder;
    a = await mk(u.token, { title: 'Pistas', folderId: folder.id });
    b = await mk(u.token, { title: 'Suspeitos', folderId: folder.id });
    c = await mk(u.token, { title: 'Linha do tempo', folderId: folder.id });
  });

  test('fio nasce vermelho, aceita outra cor e troca de cor', async () => {
    const r1 = await call('/links', { method: 'POST', token: u.token, body: { fromId: a.id, toId: b.id } });
    assert.equal(r1.data.link.color, 'red');
    const r2 = await call('/links', { method: 'POST', token: u.token, body: { fromId: b.id, toId: c.id, color: 'blue' } });
    assert.equal(r2.data.link.color, 'blue');
    assert.equal((await call('/links', { method: 'POST', token: u.token, body: { fromId: a.id, toId: c.id, color: 'rosa-choque' } })).status, 400);
    const p = await call(`/links/${r1.data.link.id}`, { method: 'PATCH', token: u.token, body: { color: 'green' } });
    assert.equal(p.status, 200);
    assert.equal(p.data.link.color, 'green');
    assert.equal((await call(`/links/${r1.data.link.id}`, { method: 'PATCH', token: u.token, body: { color: 'xadrez' } })).status, 400);
    assert.equal((await call(`/links/${r1.data.link.id}`, { method: 'PATCH', token: outro.token, body: { color: 'blue' } })).status, 404);
    const list = (await call(`/links?folder=${folder.id}`, { token: u.token })).data.links;
    assert.deepEqual(list.map((l) => l.color).sort(), ['blue', 'green']);
  });

  test('posições em lote: move só os post-its desta pasta; estranho não mexe', async () => {
    const longe = await mk(u.token, { title: 'Em outra pasta' });
    const r = await call('/notes/positions', {
      method: 'POST',
      token: u.token,
      body: {
        folderId: folder.id,
        positions: [
          { id: a.id, x: 500, y: 300 },
          { id: b.id, x: 900, y: 320 },
          { id: longe.id, x: 1, y: 1 }, // de outra pasta: ignorado
        ],
      },
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.moved, 2);
    const pos = Object.fromEntries(r.data.notes.map((n) => [n.title, [n.x, n.y]]));
    assert.deepEqual(pos.Pistas, [500, 300]);
    assert.deepEqual(pos.Suspeitos, [900, 320]);
    const ainda = (await call('/notes?folder=root', { token: u.token })).data.notes.find((n) => n.id === longe.id);
    assert.notDeepEqual([ainda.x, ainda.y], [1, 1]);
    assert.equal((await call('/notes/positions', { method: 'POST', token: outro.token, body: { folderId: folder.id, positions: [{ id: a.id, x: 0, y: 0 }] } })).status, 404);
    assert.equal((await call('/notes/positions', { method: 'POST', token: u.token, body: { folderId: folder.id, positions: [] } })).status, 400);
  });

  test('estilo das conexões nas configurações: fio (padrão) ou seta', async () => {
    assert.equal((await call('/settings', { token: u.token })).data.settings.linkStyle, 'thread');
    assert.equal((await call('/settings', { method: 'PUT', token: u.token, body: { linkStyle: 'arrow' } })).data.settings.linkStyle, 'arrow');
    assert.equal((await call('/settings', { method: 'PUT', token: u.token, body: { linkStyle: 'laser' } })).status, 400);
  });
});
