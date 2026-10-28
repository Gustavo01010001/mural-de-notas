# 📌 Mural de Notas — projeto2.0

Bloco de notas online em formato de **post-its animados** sobre um painel preto,
com **clima e hora** animados no canto e **alertas de datas importantes**
(ex.: aniversários).

| Camada   | Tecnologia                                  | Pasta       |
|----------|---------------------------------------------|-------------|
| Front    | Next.js 16 + React 19 + Framer Motion       | `frontend/` |
| Back     | Node.js + Express 5 (padrão MVC)            | `backend/`  |
| Banco    | SQLite (módulo nativo `node:sqlite`)        | `backend/data/notas.db` |

## Como funciona o fluxo

```
Usuário digita  ──►  Front (Next.js)  ──fetch──►  Back (Express)  ──►  SQLite
                     só visual               valida + regra         salva
                ◄──  mostra resposta  ◄──JSON──  responde
```

- O **front** só cuida da parte visual: envia o que o usuário digitou e mostra o que o back responder.
- O **back** valida tudo, cria hash da senha, salva no banco e calcula datas/alertas.

## Requisitos

- **Node.js 22.13 ou maior** (o SQLite já vem embutido no Node, não precisa instalar nada).

## Rodando no VS Code

Abra a pasta `projeto2.0` no VS Code e use **dois terminais**:

**Terminal 1 — backend (porta 4000):**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 — frontend (porta 3000):**
```bash
cd frontend
npm install
npm run dev
```

Acesse **http://localhost:3000**, crie sua conta em *Cadastre-se* e comece a colar post-its.

## 📱 Testar no celular com HTTPS (mesma rede Wi-Fi)

O navegador só libera **localização** (clima da sua cidade) e **notificações** em HTTPS.

1. Backend: `npm run dev` na pasta `backend`.
2. Frontend: **`npm run dev:https`** na pasta `frontend`.
   Na primeira vez ele gera os certificados (usa o `openssl` que vem com o Git) e mostra o endereço:
   `📱 No celular (mesma rede): https://SEU_IP:3000`. Se o IP do PC mudar, o certificado é refeito sozinho.
3. No celular, abra **`https://SEU_IP:3000`**.

O celular fala só com o front; o Next repassa `/api` para o backend, que fica fechado para a rede
(só o próprio PC acessa a porta 4000).

**Tirar o aviso de "conexão não particular" (recomendado para localização/notificações funcionarem):**
instale no celular a autoridade local do projeto, que fica em `https://SEU_IP:3000/mural-ca.crt`.

- **Android:** baixe o arquivo (no aviso, toque em *Avançado → Continuar* uma vez) e vá em
  *Configurações → Segurança → Criptografia e credenciais → Instalar certificado → Certificado CA*.
- **iPhone:** abra o link no Safari, instale em *Ajustes → Perfil baixado* e depois ative em
  *Ajustes → Geral → Sobre → Ajustes de Confiança de Certificado*.

> Só instale essa CA nos **seus** aparelhos. A chave privada dela (`frontend/certs/ca-key.pem`)
> fica só no seu PC e não vai para o GitHub. Depois dos testes você pode remover o certificado do celular.

Sem HTTPS também funciona: `npm run dev` e abra `http://SEU_IP:3000` (sem localização/notificações).
Se não abrir no celular, libere o Node.js no Firewall do Windows para a rede que você está usando.

## Funcionalidades

- **Cadastro e login** (senha com hash `scrypt`, sessão por token).
- **Post-its**: criar, editar (duplo clique ou ✏️), excluir (🗑️ duas vezes), **arrastar** pelo mural.
  A posição fica salva no banco. Cada post-it nasce levemente torto, com fita adesiva e animações.
- **6 cores** de post-it.
- **Datas importantes**: Aniversário 🎂, Evento 📅 ou Lembrete ⏰, com opção de repetir todo ano.
  - O post-it mostra a contagem: *Faltam 3 dias*, *Amanhã*, *É HOJE! 🎉*.
  - **No dia**, o sistema abre um alerta animado (com confete em aniversários, mostrando a idade)
    e uma notificação do navegador (se você permitir).
  - O painel "Próximas datas" mostra o que vem nos próximos 7 dias.
  - O back verifica a cada minuto, então o alerta aparece mesmo se a página ficar aberta virando o dia.
- **Clima + relógio** no canto: ícones animados (sol girando, nuvens, chuva, raios, neve, lua com
  estrelas), temperatura, mín/máx, sensação, umidade, vento, cidade e saudação ("Boa noite, Fulano!").

## 📁 Pastas e 🔍 busca (para quem escreve muito)

- **Pastas:** o botão com o nome da pasta, no topo, abre a lista. Cada pasta é um mural separado
  (ex.: *Trabalho*, *Faculdade*, *Viagem para o Rio*). Você escolhe o nome e um ícone, pode renomear
  (✏️) e apagar (🗑️ — os post-its dela voltam para o **Mural geral**, nada se perde).
  Para mudar um post-it de pasta, edite-o e troque o campo **Pasta**. O app lembra a última pasta aberta.
- **Busca (lupa ou Ctrl + K / "/"):** procura palavras no título e no texto de **todas as pastas**,
  sem ligar para acentos ("reuniao" acha "Reunião"). Mostra o trecho onde a palavra aparece e de qual
  pasta é. Ao escolher um resultado, o mural troca para a pasta certa, rola até o post-it e ele
  brilha. As "Próximas datas" também levam até o post-it.
- **Dados de exemplo:** com o backend rodando, `npm run seed -- <email> <senha>` (na pasta `backend`)
  cria 6 pastas e 40 post-its como se fosse um usuário de verdade (cria a conta se ela não existir).

## ⚙️ Configurações (botão de engrenagem)

Tudo fica salvo no banco (tabela `user_settings`), então vale em qualquer dispositivo:

- **Perfil:** editar o nome.
- **Clima e relógio:** mostrar/ocultar o widget, segundos, formato 24h, °C ou °F.
- **Simular clima dinâmico:** o fundo preto do mural passa a imitar o tempo, com animações:
  *Tempo real* (segue o clima da sua cidade), *Neutro*, *Céu limpo* (feixes de sol / estrelas e
  estrelas cadentes à noite), *Seco* (poeira dourada no ar), *Úmido* (névoa e gotinhas escorrendo
  "no vidro"), *Nublado*, *Chuvoso*, *Tempestade* (chuva com vento, relâmpagos e raios) e *Neblina*.
  Tem intensidade Baixa / Média / Alta. Respeita "reduzir movimento" do sistema e pausa quando a aba
  fica em segundo plano.
  O **Tempo real** usa só o clima atual da região do usuário (localização do navegador; se ele
  negar, usa São Paulo e avisa nas configurações) e atualiza a cada 10 min.
- **Conforto visual** (para usar o mural por horas sem cansar a vista):
  - **Menos poluição visual:** tira clarões de relâmpago, pulsos e brilhos fortes, reduz as
    partículas e deixa tudo mais lento. Os post-its continuam "respirando", e arrastar, hover e
    animações de abrir/fechar continuam funcionando.
  - **Ligar sozinho após** 30 min / 1 h / 2 h de uso (com aviso e opção de desligar por agora).
  - **Filtro de luz azul** (leve/forte), **escurecer fundo** (0–70%) e **cores suaves** nos post-its.
- **Mural:** mostrar/ocultar "Próximas datas" e cor padrão dos novos post-its.

## 📱 Responsivo

- **PC:** clima no canto superior direito, configurações abrem numa gaveta lateral.
- **Celular:** os post-its viram uma **grade** de 2 colunas (3 em telas um pouco maiores) que cabe
  na tela, na mesma ordem de leitura do mural do PC — nada fica escondido para o lado. Dá para trocar
  para o modo **Livre** (igual ao PC, com arrastar) em Configurações → Mural → "No celular".
  Clima vira uma barra compacta, "Próximas datas" vira uma pílula recolhível, botões de
  editar/excluir ficam sempre visíveis (não existe "hover" no toque) e as configurações abrem como
  uma folha que sobe de baixo.

## Clima: Google ou Open-Meteo

A API de clima do Google (**Google Weather API**, da Google Maps Platform) exige uma chave com
faturamento ativado. Por isso o projeto funciona assim:

- **Sem chave** → usa a **Open-Meteo** (gratuita, sem cadastro). Já funciona de cara.
- **Com chave** → crie `backend/.env` (copie de `.env.example`) e preencha:
  ```
  GOOGLE_WEATHER_API_KEY=sua_chave_aqui
  ```
  Reinicie o backend: o clima passa a vir do Google (se o Google falhar, cai para a Open-Meteo).

A chave fica **só no backend**, nunca vai para o navegador.

## Rotas da API (`http://localhost:4000/api`)

| Método | Rota                     | O que faz                                  |
|--------|--------------------------|--------------------------------------------|
| POST   | `/auth/register`         | Cadastra usuário e devolve token           |
| POST   | `/auth/login`            | Login                                      |
| GET    | `/auth/me`               | Usuário logado                             |
| POST   | `/auth/logout`           | Encerra a sessão                           |
| GET    | `/folders`               | Lista pastas (com quantidade de post-its)  |
| POST   | `/folders`               | Cria pasta (nome + ícone)                  |
| PUT    | `/folders/:id`           | Renomeia / troca ícone                     |
| DELETE | `/folders/:id`           | Apaga pasta (post-its vão p/ Mural geral)  |
| GET    | `/notes?folder=root\|id` | Lista post-its da pasta                    |
| GET    | `/notes/search?q=`       | Busca palavras em todas as pastas          |
| PATCH  | `/notes/:id/folder`      | Move post-it para outra pasta              |
| POST   | `/notes`                 | Cria post-it                               |
| PUT    | `/notes/:id`             | Edita post-it                              |
| PATCH  | `/notes/:id/position`    | Salva posição ao arrastar                  |
| DELETE | `/notes/:id`             | Exclui post-it                             |
| GET    | `/alerts`                | Alertas de hoje + próximos 7 dias          |
| POST   | `/alerts/:id/dismiss`    | Fecha o alerta (não aparece mais hoje)     |
| GET    | `/settings`              | Configurações do usuário                   |
| PUT    | `/settings`              | Salva configurações (só as chaves válidas) |
| PUT    | `/profile`               | Altera o nome                              |
| GET    | `/weather?lat=&lon=`     | Clima e fuso horário                       |

## Estrutura

```
projeto2.0/
├── backend/
│   └── src/
│       ├── config/db.js          # conexão e tabelas do SQLite
│       ├── models/               # acesso ao banco (users, sessions, notes)
│       ├── controllers/          # recebem a requisição e respondem
│       ├── services/             # regras: alertas de datas e clima
│       ├── middlewares/          # autenticação e tratamento de erros
│       ├── routes/index.js       # todas as rotas
│       ├── utils/                # validação, senha, datas
│       └── server.js
└── frontend/
    ├── app/                      # páginas: / (mural), /login, /cadastro
    ├── components/               # PostIt, NoteModal, AlertModal, WeatherWidget...
    └── lib/api.js                # única ponte do front com o back
```

Para zerar o banco, pare o backend e apague a pasta `backend/data/`.
