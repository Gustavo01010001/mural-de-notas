# 📌 Mural de Notas

Bloco de notas online em formato de **post-its animados** sobre um painel preto,
com **clima e hora** animados no canto, **pastas** por assunto, **busca** e
**alertas de datas importantes** (ex.: aniversários).

| Camada   | Tecnologia                                  | Pasta       |
|----------|---------------------------------------------|-------------|
| Front    | Next.js 16 + React 19 + Framer Motion       | `frontend/` |
| Back     | Node.js + Express 5 (padrão MVC)            | `backend/`  |
| Banco    | SQLite (módulo nativo `node:sqlite`)        | `backend/data/notas.db` |

## Como funciona o fluxo

```
Navegador (PC/celular) ══HTTPS══►  Front (Next.js)  ──/api──►  Back (Express)  ──►  SQLite
                                   só visual                  valida + regra        salva
                       ◄══HTTPS══  mostra resposta  ◄──JSON──  responde
```

- O navegador fala **só com o front, sempre em HTTPS** (conexão criptografada, cadeado 🔒).
- O **front** cuida da parte visual e repassa as chamadas `/api` para o back.
- O **back** valida tudo, cria hash da senha, salva no banco e calcula datas/alertas. Ele roda
  **só dentro do seu PC** (`127.0.0.1:4000`), sem acesso pela rede — por isso não precisa de certificado.

## Requisitos

- **Node.js 22.13 ou maior** (o SQLite já vem embutido no Node, não precisa instalar nada).
- **Git para Windows** (já traz o `openssl`, usado para gerar o certificado HTTPS).

## Rodando no VS Code

```bash
git clone https://github.com/Gustavo01010001/mural-de-notas.git
```

Abra a pasta `mural-de-notas` no VS Code e use **dois terminais**:

**Terminal 1 — backend:**
```bash
cd backend
npm install
npm run dev
```

**Terminal 2 — frontend (HTTPS, porta 3000):**
```bash
cd frontend
npm install
npm run dev
```

Na primeira vez o front gera os certificados sozinho e mostra os endereços. Acesse
**https://localhost:3000**, crie sua conta em *Cadastre-se* e comece a colar post-its.

### 🔒 Confiar no certificado (uma vez por aparelho)

O certificado é criado por uma "autoridade" que existe só no seu PC, então na primeira vez o
navegador mostra **"Sua conexão não é particular"**. Para o cadeado aparecer normal:

- **PC (Windows):** rode no terminal e clique em **Sim** na janela que abrir; depois feche e abra o navegador.
  ```bash
  certutil -user -addstore Root "frontend\certs\ca.pem"
  ```
  Para desfazer: `certutil -user -delstore Root "Mural de Notas - CA local"`.
- **Celular:** veja a seção abaixo.

## 🧪 Testes

- `npm test` na pasta `backend`: 51 testes automáticos da API (usam um banco temporário).
- Relatório completo dos testes de PC e celular: [TESTES.md](TESTES.md).

## 📱 Usar no celular (mesma rede Wi-Fi)

1. Com backend e frontend rodando, veja no terminal do front a linha
   `📱 No celular (mesma rede): https://SEU_IP:3000` (ou descubra o IP com `ipconfig`).
2. No celular, abra **`https://SEU_IP:3000`** — digite o `https://` no começo.
   Se o IP do PC mudar, o certificado é refeito sozinho na próxima vez que o front subir.
3. Para tirar o aviso de "conexão não particular" (e liberar **localização** e **notificações**),
   instale no celular a autoridade local do projeto, que fica em `https://SEU_IP:3000/mural-ca.crt`:
   - **Android:** baixe o arquivo (no aviso, toque em *Avançado → Continuar* uma vez) e vá em
     *Configurações → Segurança → Criptografia e credenciais → Instalar certificado → Certificado CA*.
   - **iPhone:** abra o link no Safari, instale em *Ajustes → Perfil baixado* e depois ative em
     *Ajustes → Geral → Sobre → Ajustes de Confiança de Certificado*.

> Só confie nessa autoridade nos **seus** aparelhos. A chave privada dela (`frontend/certs/ca-key.pem`)
> fica só no seu PC e não vai para o GitHub. Depois dos testes você pode remover o certificado.

Se não abrir no celular, libere o Node.js no Firewall do Windows para a rede que você está usando.

<details>
<summary>Rodar sem HTTPS (não recomendado)</summary>

`npm run dev:http` na pasta `frontend` e abra `http://localhost:3000`. Nesse modo o navegador
**não libera** localização nem notificações, e a conexão não é criptografada.
</details>

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

## 🗑️ Lixeira, desfazer e organização dos post-its

- **Excluir não apaga na hora:** aparece "Post-it foi para a lixeira · **Desfazer**" (ou **Ctrl+Z**).
  O post-it fica **30 dias** na **Lixeira** (no seletor de pastas), onde dá para restaurar ou apagar de vez.
- **Arquivar:** tira do mural sem apagar (também com Desfazer). Fica em **📦 Arquivados**.
- **Fixar (📌):** o post-it fica por cima de todos e em primeiro na grade do celular e ao arrumar.
- **Menu ⋯ do post-it:** duplicar, selecionar, arquivar, excluir.
- **Checklist:** itens com ☐/☑ direto no post-it e barrinha de progresso (com aviso quando completa).
- **Etiquetas (#urgente, #ideia):** clique numa etiqueta para filtrar o mural; na busca, `#etiqueta`.
- **Links clicáveis** no texto e **foto** no post-it (o app reduz a foto antes de enviar: 5 MB viram ~15–300 KB).
- **Tamanho:** arraste o cantinho inferior direito do post-it (no PC).
- **Selecionar vários:** botão ☑ Selecionar (ou Shift+clique) → mover para pasta, fixar, arquivar ou excluir de uma vez.
- **▦ Arrumar:** organiza a pasta em grade com animação (fixados primeiro).
- **Zoom:** – 100% + no canto (ou Ctrl + rodinha do mouse), de 40% a 160%.

## 👥 Pastas organizadas e compartilhadas

- **Subpastas** (até 3 níveis: Faculdade › Cálculo › Provas), **cor** de cada pasta e **ordem**
  (arraste a alça ⠿ no seletor de pastas). O topo mostra o caminho: "Faculdade › Cálculo".
- **Arrastar o post-it até uma pasta:** ao começar a arrastar aparece uma faixa com as pastas no alto
  da tela; solte em cima de uma para mover (com Desfazer). No celular: menu ⋯ → "Mover para pasta…".
- **Compartilhar (👥):** convide alguém pelo **ID** ou pelo e-mail (a pessoa precisa ter conta). Quem foi
  convidado vê e edita os post-its daquela pasta, que aparece em "Compartilhadas comigo". Só quem criou
  renomeia, apaga ou convida; o convidado pode sair quando quiser.
- **ID para convite:** cada conta ganha um ID próprio (ex.: `K7P2-9QXM`) que aparece em
  **Configurações → Perfil**, embaixo do nome, com botão **Copiar** (e **Enviar** no celular). A pessoa manda
  o ID para o colega, que cola no campo "Convidar alguém". Aceita colado em minúsculas, sem hífen ou com
  espaços. O ID não revela o e-mail: a lista de participantes mostra **nome + ID**, nunca o e-mail.
  O ID é aleatório e sem letras que se confundem (0/O, 1/I/L); até 30 convites a cada 10 min por pessoa.
- **Duas pessoas editando o mesmo post-it:** ninguém apaga o trabalho do outro sem saber. Se alguém mudar
  enquanto sua janela está aberta, aparece "Fulano acabou de mudar este post-it"; ao salvar, você escolhe
  **usar a versão dele(a)** ou **salvar a sua mesmo assim**. Lembretes, lixeira ("excluídos por mim") e backup
  também incluem as pastas do grupo. Teste completo com 5 pessoas em [TESTE_GRUPO.md](TESTE_GRUPO.md).
- **Ao vivo, como no Miro:** com a pasta aberta, cada pessoa vê o **cursor das outras com o nome**,
  as bolinhas de quem está na pasta agora e os post-its mudando na hora (sem recarregar).
  Funciona com Server-Sent Events (uma conexão aberta do servidor para o navegador), sem bibliotecas extras.

## 🗺️ Mural infinito (como no Miro)

No PC (e no celular em "Livre"), o mural é um espaço sem fim:

| Quero… | Como |
|---|---|
| **Mover o mural** | Arraste o fundo com o mouse (solta e ele desliza um pouco e freia) · botão do meio · **Espaço** + arrastar · dois dedos no touchpad · um dedo no celular |
| **Aproximar / afastar** | **Ctrl + roda do mouse** ou **pinça** no touchpad/celular — o zoom mira onde está o cursor · botões − / + · teclas **+** e **−** · **0** volta a 100% (25% a 200%) |
| **Ver tudo** | Botão ⛶ **Ajustar à tela** ou **Shift + 1** |
| **Ir para outra parte** | **Minimapa** (canto inferior direito): clique ou arraste o retângulo amarelo. Esconde/mostra no menu ⋯ Mais |
| **Levar um post-it longe** | Arraste até a borda da tela: o mural rola sozinho enquanto você segura |
| **Ligar dois post-its** | Passe o mouse no post-it e arraste a **bolinha** da borda direita até o outro (no toque: ⋯ → *Ligar a outro post-it* e toque no destino). A seta acompanha quando você move os post-its |
| **Tirar uma seta** | Clique nela → ✕ (com **Desfazer**) |
| **Agrupar por assunto** | ⋯ Mais → **Organizar por assunto**: junta os post-its pela 1ª **#etiqueta** (assunto com 2+ post-its vira um bloco; os avulsos ficam em "outros") e contorna cada assunto com o nome dele. *Mostrar assuntos* liga/desliga os contornos; clicar no nome filtra o assunto |

Setas também valem nas **pastas compartilhadas** (o grupo vê na hora), vão no **backup** e somem/voltam junto
com o post-it na lixeira. Por desempenho, o zoom e o movimento são aplicados direto na tela durante o gesto e
só depois gravados (nada de redesenhar todos os post-its a cada movimento).

## 📅 Lembretes, repetição e calendário

- **Horário opcional** ("Reunião às 14:00") e **aviso antecipado**: 15/30 min, 1/2 h, 1 ou 2 dias ou
  1 semana antes. O alerta aparece duas vezes: no aviso ("🔔 Daqui a 1 h") e na hora.
- **Repetição:** toda semana, todo mês ("todo dia 5" — dia 31 vira o último dia do mês) ou todo ano.
- **📅 Calendário do mês** (botão no topo): pontinhos coloridos nos dias com post-its, contando as
  repetições; clique no dia para ver a lista e abrir o post-it.
- **Adicionar ao Google Agenda:** no menu ⋯ do post-it ou na lista do calendário (já vai com a repetição).

## 📁 Pastas e 🔍 busca (para quem escreve muito)

- **Pastas:** o botão com o nome da pasta, no topo, abre a lista. Cada pasta é um mural separado
  (ex.: *Trabalho*, *Faculdade*, *Viagem para o Rio*). Você escolhe o nome e um ícone, pode renomear
  (✏️) e apagar (🗑️ — os post-its dela voltam para o **Mural geral**, nada se perde).
  Para mudar um post-it de pasta, edite-o e troque o campo **Pasta**. O app lembra a última pasta aberta.
- **Filtros da busca:** cor, pasta, etiqueta e "só os que têm data" (dá para usar sem digitar nada).
  **Busca por data:** "outubro", "dezembro 2026", "25/12", "hoje", "amanhã" (conta repetições).
  **Buscas recentes** ficam salvas no navegador.
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
- **Aparência e acessibilidade:** tema **Escuro / Claro / Automático** (segue o sistema), tamanho da
  letra (A, A+, A++, A+++) e **alto contraste** (bordas fortes, sem transparência, texto sem cinza).
- **Sons e foco:** **sons suaves** opcionais ao colar, excluir, desfazer e concluir (com volume) e o
  **timer de foco (Pomodoro)**: 25 min de foco e 5 de pausa (ajustável), discreto embaixo do mural,
  com botão ⏱ Foco nas ferramentas. Continua contando se recarregar a página e mostra o tempo na aba.
- **Clima:** previsão dos **próximos 5 dias** (máx/mín e chance de chuva) dentro do widget.

## 🔐 Conta, segurança e privacidade (LGPD)

- **Login num cookie seguro** (`httpOnly`, `Secure`, `SameSite=Lax`): o JavaScript da página não
  consegue ler a sessão. No banco fica só o *hash* do token. Pedidos que alteram dados exigem o
  cabeçalho `X-Mural: 1` (proteção contra CSRF). Quem estava logado pelo jeito antigo é migrado sozinho.
- **Limite de tentativas:** 8 logins errados em 15 min por e-mail+IP e 10 cadastros por hora por IP.
- **Trocar ou criar senha** em Configurações → Conta (encerra as sessões dos outros aparelhos).
- **Baixar backup** (arquivo `.json` com pastas, post-its, fotos e configurações), **Salvar em PDF**
  (página `/exportar`, pronta para imprimir) e **Importar backup** (não apaga nada, só acrescenta).
- **Excluir conta:** pede a senha e avisa para baixar o backup antes. A conta fica **30 dias** guardada:
  se a pessoa entrar de novo nesse prazo, tudo volta como estava; depois disso é apagada de vez.
  Os post-its **não são criptografados** — o aviso recomenda guardar senhas num gerenciador de senhas.
- **Backup automático do banco:** uma cópia por dia em `backend/data/backups/` (guarda as 7 últimas;
  `BACKUP_DISABLED=1` desliga). Essa pasta nunca vai para o GitHub.
- "Esqueci minha senha" por e-mail e "Entrar com Google" já têm o backend pronto
  (`SMTP_*`, `GOOGLE_CLIENT_ID` no `.env`), mas **ainda não aparecem na tela** — ficaram para depois.

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

## Rotas da API (acessadas pelo navegador em `https://localhost:3000/api`)

| Método | Rota                     | O que faz                                  |
|--------|--------------------------|--------------------------------------------|
| POST   | `/auth/register`         | Cadastra usuário (sessão em cookie)        |
| POST   | `/auth/login`            | Login (reativa conta excluída há < 30 dias) |
| GET    | `/auth/me`               | Usuário logado                             |
| POST   | `/auth/logout`           | Encerra a sessão e apaga o cookie          |
| POST   | `/auth/cookie`           | Troca token antigo (localStorage) por cookie |
| POST   | `/auth/password`         | Troca / cria senha                         |
| GET    | `/auth/config`           | Diz se e-mail e Google estão configurados  |
| POST   | `/auth/forgot`, `/auth/reset` | Esqueci minha senha (sem tela ainda)  |
| GET    | `/account/export`        | Baixa backup em JSON                       |
| POST   | `/account/import`        | Importa um backup                          |
| DELETE | `/account`               | Exclui a conta (30 dias para voltar)       |
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
| DELETE | `/notes/:id`             | Manda o post-it para a lixeira             |
| POST   | `/notes/:id/restore`     | Tira da lixeira (desfazer)                 |
| DELETE | `/notes/:id/permanent`   | Apaga de vez (só quem está na lixeira)     |
| GET/DELETE | `/notes/trash`       | Lista / esvazia a lixeira                  |
| GET    | `/notes/archived`        | Lista os arquivados                        |
| POST   | `/notes/:id/archive`     | Arquiva / desarquiva                       |
| POST   | `/notes/:id/pin`         | Fixa / desafixa                            |
| POST   | `/notes/:id/duplicate`   | Duplica                                    |
| PATCH  | `/notes/:id/checklist/:item` | Marca item da checklist                |
| PATCH  | `/notes/:id/size`        | Salva o tamanho                            |
| GET/PUT/DELETE | `/notes/:id/image` | Foto do post-it                          |
| POST   | `/notes/batch`           | Mover/fixar/arquivar/excluir vários        |
| POST   | `/notes/arrange`         | Arrumar a pasta em grade                   |
| PUT    | `/folders/order`         | Nova ordem das pastas de um nível          |
| GET/POST | `/folders/:id/members` | Quem participa / convidar (`{ who }`: ID ou e-mail) |
| DELETE | `/folders/:id/members/:userId` | Tirar alguém ou sair da pasta        |
| GET    | `/live/folders/:id`      | "Ao vivo" (SSE): presença, cursores, mudanças |
| POST   | `/live/folders/:id/cursor` | Posição do meu cursor                    |
| GET    | `/calendar?month=AAAA-MM` | Post-its com data em cada dia do mês      |
| GET    | `/notes/tags`            | Etiquetas usadas (filtro da busca)         |
| GET/POST | `/links?folder=` · `/links` | Setas entre post-its da pasta / ligar dois (`{ fromId, toId }`) |
| DELETE | `/links/:id`             | Tirar uma seta                             |
| POST   | `/notes/arrange` `{ mode: 'subject' }` | Organizar por assunto (1ª etiqueta) |
| GET    | `/alerts`                | Alertas de hoje + próximos 7 dias          |
| POST   | `/alerts/:id/dismiss`    | Fecha o alerta (não aparece mais hoje)     |
| GET    | `/settings`              | Configurações do usuário                   |
| PUT    | `/settings`              | Salva configurações (só as chaves válidas) |
| PUT    | `/profile`               | Altera o nome                              |
| GET    | `/weather?lat=&lon=`     | Clima e fuso horário                       |

## Estrutura

```
mural-de-notas/
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
