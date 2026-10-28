// Simula um usuário que gosta MUITO de escrever: cria pastas e dezenas de post-its pela própria API
// (o mesmo caminho que o front usa). O backend precisa estar rodando.
//
// Uso:  npm run seed -- <email> <senha>
//       (entra na conta, ou cria se ela ainda não existir)

const API = process.env.API_URL || 'http://127.0.0.1:4000/api';
const [email, password] = process.argv.slice(2);
const TZ = 'America/Sao_Paulo';

if (!email || !password) {
  console.error('Uso: npm run seed -- <email> <senha>');
  process.exit(1);
}

let token = null;

async function call(path, method = 'GET', body) {
  const res = await fetch(`${API}${path}${path.includes('?') ? '&' : '?'}tz=${TZ}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || res.statusText), { status: res.status });
  return data;
}

// Data daqui a N dias (YYYY-MM-DD)
const inDays = (n) => {
  const d = new Date(Date.now() + n * 86_400_000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
};

const BOARD = {
  null: [
    ['Ligar pro dentista', 'Remarcar a limpeza. Tel: (11) 4002-8922', 'blue'],
    ['Pagar conta de luz', 'Vence essa semana, não esquecer!!', 'orange', { eventDate: inDays(2), eventType: 'reminder' }],
    ['Devolver livro da biblioteca', '"O Hobbit" — multa de R$ 2 por dia', 'green'],
    ['Aprender violão', 'Ver aulas no YouTube, começar com acordes G, C, D', 'purple'],
    ['Lavar o carro', 'Sábado de manhã se não chover', 'yellow'],
    ['Responder e-mail do síndico', 'Sobre a reforma da garagem', 'pink'],
    ['Mercado', 'Arroz, feijão, café, leite, ovos, banana, pão de forma', 'yellow'],
  ],
  Trabalho: [
    ['Reunião de alinhamento', 'Segunda 9h — levar números do trimestre e dúvidas sobre o roadmap', 'blue', { eventDate: inDays(4), eventType: 'event' }],
    ['Relatório mensal de vendas', 'Fechar até dia 5. Puxar dados do CRM e comparar com outubro', 'yellow'],
    ['Revisar PR do João', 'Refatoração do login. Conferir os testes!', 'green'],
    ['1:1 com a gestora', 'Falar sobre promoção e feedback do projeto', 'purple', { eventDate: inDays(6), eventType: 'event' }],
    ['Pedir férias de janeiro', 'Ver no RH se dá pra dividir em 2 períodos', 'orange'],
    ['Daily 9h15', 'Comentar o bloqueio na API de pagamentos', 'blue'],
    ['Apresentação pro cliente', 'Slides com o protótipo novo + cronograma', 'pink'],
    ['Planilha de custos', 'Atualizar licenças de software e servidores', 'yellow'],
    ['Feedback do estagiário', 'Pontos fortes: proatividade. Melhorar: documentação', 'green'],
  ],
  Faculdade: [
    ['Prova de Cálculo II', 'Integrais duplas e coordenadas polares. Refazer lista 3', 'pink', { eventDate: inDays(6), eventType: 'event' }],
    ['Trabalho de Banco de Dados', 'Modelar o banco da biblioteca + consultas com JOIN e GROUP BY', 'blue'],
    ['Ler capítulo 4', 'Engenharia de Software — requisitos não funcionais', 'yellow'],
    ['Reunião do TCC', 'Quinta 19h no Discord. Levar a introdução revisada', 'purple'],
    ['Lista de Física', 'Exercícios 1 a 15 — cinemática', 'green'],
    ['Relatório de estágio', 'Pedir assinatura do supervisor antes de entregar', 'orange', { eventDate: inDays(12), eventType: 'reminder' }],
    ['Estudar Next.js', 'App Router, Server Components e rotas dinâmicas', 'blue'],
    ['Artigos para o TCC', 'Procurar no Google Acadêmico: "acessibilidade em apps web"', 'yellow'],
  ],
  'Viagem para o Rio': [
    ['Comprar passagem', 'Comparar preço de avião x ônibus. Ver milhas!', 'blue'],
    ['Reservar hotel', 'Copacabana ou Ipanema, perto do metrô', 'green'],
    ['Roteiro', 'Cristo Redentor, Pão de Açúcar, Escadaria Selarón, Lapa à noite', 'yellow'],
    ['Checklist da mala', 'Protetor solar, chinelo, carregador, documentos, óculos de sol', 'orange'],
    ['Dia da viagem! ✈️', 'Sair de casa às 5h', 'pink', { eventDate: inDays(20), eventType: 'event' }],
    ['Orçamento', 'Total: R$ 2.500 — hotel 1.200, passagem 700, passeios 600', 'purple'],
  ],
  Receitas: [
    ['Bolo de cenoura', '3 cenouras, 4 ovos, 1 xícara de óleo, 2 de açúcar, 2,5 de farinha. Cobertura de chocolate!', 'orange'],
    ['Strogonoff de frango', 'Frango em cubos, creme de leite, ketchup, mostarda, champignon', 'yellow'],
    ['Panqueca de banana', '1 banana + 2 ovos + aveia. Frigideira antiaderente', 'green'],
    ['Lasanha da mãe', 'Molho branco caseiro + presunto e queijo. 40 min no forno', 'pink'],
    ['Brigadeiro de colher', '1 lata de leite condensado, 1 colher de manteiga, 2 de chocolate em pó', 'purple'],
  ],
  'Ideias de projetos': [
    ['App de controle de gastos', 'Gráfico por categoria e alerta quando passar do limite', 'blue'],
    ['Bot do Discord', 'Lembretes automáticos para o grupo do TCC', 'purple'],
    ['Portfólio', 'Next.js + animações, mostrar os projetos da faculdade', 'yellow'],
    ['Jogo da memória', 'Em React com cartas de animais, para treinar estado', 'green'],
    ['Site de receitas', 'Juntar as receitas da pasta Receitas num site bonito', 'orange'],
  ],
};

const ICONS = { Trabalho: '💼', Faculdade: '📚', 'Viagem para o Rio': '✈️', Receitas: '🍳', 'Ideias de projetos': '💡' };

// Espalha em grade com um pouco de bagunça, longe do widget de clima (canto superior direito)
function position(i) {
  const col = i % 4;
  const row = Math.floor(i / 4);
  return {
    x: 40 + col * 265 + Math.round(Math.random() * 40 - 20),
    y: 120 + row * 255 + Math.round(Math.random() * 30 - 15),
  };
}

async function main() {
  try {
    ({ token } = await call('/auth/login', 'POST', { email, password }));
  } catch {
    ({ token } = await call('/auth/register', 'POST', { name: 'Usuário Demo', email, password }));
  }

  const existing = (await call('/folders')).folders;
  let total = 0;

  for (const [folderName, notes] of Object.entries(BOARD)) {
    let folderId = null;
    if (folderName !== 'null') {
      const found = existing.find((f) => f.name === folderName);
      folderId = found ? found.id : (await call('/folders', 'POST', { name: folderName, icon: ICONS[folderName] })).folder.id;
    }
    const already = (await call(`/notes?folder=${folderId ?? 'root'}`)).notes.length;
    for (const [i, [title, content, color, extra = {}]] of notes.entries()) {
      await call('/notes', 'POST', { title, content, color, folderId, ...position(i + already), ...extra });
      total++;
    }
    console.log(`  ${folderName === 'null' ? '📌 Mural geral' : `${ICONS[folderName]} ${folderName}`}: ${notes.length} post-its`);
  }
  console.log(`\n✅ ${total} post-its criados para ${email}`);
}

main().catch((err) => {
  console.error('❌', err.message, '\nO backend está rodando em', API, '?');
  process.exit(1);
});
