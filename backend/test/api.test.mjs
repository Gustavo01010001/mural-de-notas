// Testes automáticos da API (node:test, sem dependências).
// Sobe o backend numa porta própria com um banco TEMPORÁRIO — o banco real (data/) não é tocado.
// Rodar:  npm test   (na pasta backend)
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { todayIn, nextOccurrence, isValidDate } from '../src/utils/dates.js';
import { normalize } from '../src/services/searchService.js';

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
  const email = `user${Date.now()}${seq++}@teste.dev`;
  const r = await call('/auth/register', { method: 'POST', body: { name, email, password: 'senha-forte-1' } });
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
    env: { ...process.env, PORT: String(PORT), HOST: '127.0.0.1', DB_DIR: dbDir, GOOGLE_WEATHER_API_KEY: '' },
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
    assert.deepEqual(nextOccurrence('2000-10-27', true, '2026-10-27'), { daysUntil: 0, years: 26 });
    assert.equal(nextOccurrence('2000-10-28', true, '2026-10-27').daysUntil, 1);
    assert.equal(nextOccurrence('2000-10-26', true, '2026-10-27').daysUntil, 364); // já passou: ano que vem
    assert.equal(nextOccurrence('2026-12-25', false, '2026-10-27').daysUntil, 59);
    assert.equal(nextOccurrence('2026-10-01', false, '2026-10-27'), null); // evento único que passou
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
    const weird = await call('/folders', { method: 'POST', token, body: { name: 'Ícone estranho', icon: '<b>' } });
    assert.equal(weird.data.folder.icon, '📁');
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
