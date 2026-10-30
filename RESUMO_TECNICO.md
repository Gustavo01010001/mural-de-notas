# 🧭 Resumo técnico — Mural de Notas

Registro para retomar o projeto depois. Atualizado em **29/10/2026** (commit `547bd2a`).
Repositório: https://github.com/Gustavo01010001/mural-de-notas (público, branch `main`).
Pasta local: `C:\Users\Gustavo\OneDrive\Desktop\projeto2.0`.

---

## 1. O que é

Bloco de notas online em formato de **post-its animados** sobre um mural preto, com clima/hora no canto,
alertas de datas importantes, pastas (inclusive compartilhadas ao vivo) e busca. Roda no PC e no celular.

## 2. Requisitos do dono do projeto (preservar)

- **Front só visual**: o front envia o que o usuário digitou; **o back valida, aplica as regras e salva**
  no SQLite e responde. Nenhuma regra de negócio no front.
- Stack: **Next.js** (front), **Node/Express** (back), **SQLite** (banco), feito para rodar no VS Code.
- Mural **preto**, post-its **animados e interativos**; clima e hora **animados** num canto.
- **Alerta no dia** de datas importantes (ex.: aniversário) — e agora também no horário e com aviso antecipado.
- **Responsivo** para PC e celular.
- **Conforto visual**: opção "menos poluição visual" que **não tira a interatividade** e mantém os post-its se mexendo.
- Pensado para **pessoas leigas**: mensagens claras em português, nada assustador.
- Nome escolhido pelo dono: **Mural de Notas** (ele rejeitou "Colaí").
- **Nunca mexer na pasta `Desktop\Project`** (projeto Doceria-da-Raissa).
- **Nunca enviar para o GitHub**: senhas, banco de dados, `.env`, certificados/chaves privadas.
- Hospedagem: **Oracle Cloud está fora** (a criação da conta falha) — não sugerir.

## 3. Arquitetura

```
Navegador ══HTTPS══► Next.js (frontend/, porta 3000) ──/api/* (rewrite)──► Express (backend/, 127.0.0.1:4000) ──► SQLite
```

- O navegador fala **só com o front**; `next.config.mjs` faz rewrite de `/api/*` para o backend.
  Assim o celular aceita **um único certificado** e o backend fica **fechado para a rede** (`HOST=127.0.0.1`).
- **HTTPS local é o padrão**: `npm run dev` no frontend roda `scripts/gen-cert.mjs` (openssl do Git), que cria uma
  CA local + certificado para `localhost`, `127.0.0.1` e os IPs da rede; refaz sozinho se o IP mudar.
  `npm run dev:http` existe como alternativa (sem localização/notificações).
- **Backend em MVC**: `src/config/db.js` (conexão + migrações automáticas), `models/`, `controllers/`,
  `services/`, `middlewares/`, `routes/index.js`, `utils/`.
- **Banco**: `node:sqlite` nativo (Node ≥ 22.13, usamos 24), arquivo `backend/data/notas.db`. Variável
  `DB_DIR` troca a pasta (usada pelos testes). Migrações são aditivas (`ALTER TABLE ADD COLUMN` se faltar).
- **Auth**: senha com `scrypt` + salt; sessão por token aleatório (30 dias) na tabela `sessions`;
  front guarda o token em `localStorage` (`mural_token`) e manda `Authorization: Bearer`.
- **Clima**: `services/weatherService.js` — Google Weather API se houver `GOOGLE_WEATHER_API_KEY`, senão Open-Meteo
  (gratuita); cidade via Nominatim; cache de 10 min. Localização do navegador (fallback São Paulo).
- **Ao vivo**: Server-Sent Events (`services/liveService.js`) — sem bibliotecas novas. O front lê o fluxo com
  `fetch` (para mandar o token no cabeçalho). Cursores via `POST /live/folders/:id/cursor` (limitado a ~25/s).
- **Acesso** centralizado em `services/accessService.js`: dono vs. convidado de pasta compartilhada.
  Post-its de pasta compartilhada **continuam do dono** (`user_id` = dono, `created_by` = quem criou).

### Tabelas
`users`, `sessions`, `notes` (posição, rotação, z, cor, tamanho, fixado, checklist JSON, tags JSON, data, hora,
aviso antecipado, repetição, alertas fechados JSON, lixeira/arquivado, pasta, criado por), `note_images` (foto
em BLOB), `folders` (dono, nome, ícone, cor, pai, posição), `folder_members`, `user_settings` (JSON).

### Front (frontend/)
- `app/page.js` — o mural (estado, handlers, layout); `app/login`, `app/cadastro`.
- `components/`: `PostIt`, `NoteModal`, `AlertModal`, `WeatherWidget`/`WeatherIcon`/`Clock`, `WeatherBackground`
  (canvas do clima dinâmico), `SettingsPanel`, `FolderSwitcher` (árvore + reordenar), `ShareModal`, `LiveLayer`
  (cursores, presença, faixa de soltar), `CalendarPanel`, `SearchPalette`, `TrashPanel`, `BoardTools`, `Toasts`.
- `lib/`: `api.js` (única ponte com o back), `format.js` (rótulos, Google Agenda), `folderTree.js`, `useLiveFolder.js`,
  `useWeather.js`, `scenes.js`, `noteHelpers.js` (links, etiquetas, compressão de foto), `highlight.js`.
- CSS: `app/globals.css` + `app/features.css` (peças da rodada 3).

## 4. O que foi feito (por etapa)

1. **Base**: cadastro/login, post-its (criar/editar/excluir/arrastar), datas importantes com alerta + confete,
   clima e relógio animados, fundo preto com estrelas.
2. **Configurações** (⚙️): ocultar clima, segundos, 24h, °C/°F, cor padrão; **clima dinâmico** de fundo
   (Tempo real = clima atual da região; ou cena manual: seco, úmido, chuva, tempestade, neve, neblina...).
3. **Conforto visual**: menos poluição visual (sem clarões/pulsos, menos partículas, mais lento, post-its
   continuam "respirando"), ligar sozinho após 30 min/1 h/2 h, filtro de luz azul, escurecer fundo, cores suaves.
4. **Pastas e busca**: pastas por tópico, busca em todas as pastas sem acento, pular até o post-it.
5. **Celular**: grade de 2–3 colunas na ordem do PC (opção "Livre"), "Próximas datas" recolhível.
6. **Rede/HTTPS**: acesso pelo IP da rede, HTTPS local com CA própria, API só via front.
7. **Testes**: suíte `node:test` + relatório `TESTES.md`.
8. **Organização**: lixeira 30 dias com Desfazer/Ctrl+Z, arquivar, fixar, duplicar, checklist com progresso,
   etiquetas com filtro, links clicáveis, foto (comprimida no navegador, validada por assinatura no back, sem cache),
   redimensionar, seleção múltipla em lote, arrumar em grade, zoom.
9. **Rodada 3**: subpastas (3 níveis), cor e ordem das pastas, arrastar post-it até pasta, **compartilhar pasta com
   cursores e mudanças ao vivo**, lembrete com horário + aviso antecipado, repetição semanal/mensal/anual,
   calendário do mês, Google Agenda, busca com filtros/por data/recentes.
10. **Rodada 4**: tema claro/automático, tamanho da letra, alto contraste, timer de foco (Pomodoro),
   previsão de 5 dias, sons suaves (Web Audio, sem arquivos); sessão em cookie httpOnly com token em hash,
   proteção CSRF, limite de tentativas, trocar senha, backup JSON/PDF/importar, excluir conta com 30 dias
   para voltar, backup diário do banco. E-mail de "esqueci a senha" e login Google: backend pronto, sem tela.

## 5. Decisões importantes (e por quê)

| Decisão | Motivo |
|--------|--------|
| SQLite nativo do Node | sem compilar nada no Windows |
| API via rewrite do Next, backend em 127.0.0.1 | um certificado só no celular; banco não exposto na rede |
| HTTPS com CA local | localização e notificações exigem HTTPS; certificado público exige domínio |
| SSE em vez de WebSocket | passa pelo proxy do Next (testado), zero dependências |
| Post-it de pasta compartilhada pertence ao dono | permissões simples; convidado "empresta" o acesso |
| Proibido mover post-it entre donos | ninguém "leva embora" o post-it do outro (sugere Duplicar) |
| Compartilhar vale só para a pasta (não para subpastas) | simplicidade; deixar explícito |
| Lixeira por `deleted_at` (soft delete) | permitir Desfazer; limpeza automática após 30 dias |
| Foto em BLOB no banco + `Cache-Control: no-store` | privacidade em PC compartilhado (bug achado e corrigido) |
| Alertas fechados guardados por "dia:etapa" | aviso antecipado e "na hora" são fechados separadamente |
| Funções puras em `utils/` (`dates`, `dateQuery`, `reminders`, `text`) | testes não abrem o banco real |
| Zoom/arrumar/redimensionar/arrastar só no modo livre (PC) | no toque não fazem sentido na grade |
| Sessão em cookie `mural_session` + hash SHA-256 no banco | JS não lê a sessão; vazamento do banco não dá acesso |
| Cookie + método ≠ GET exige `X-Mural: 1` | CSRF: outro site não consegue mandar esse cabeçalho |
| Bearer continua aceito; token no corpo só sem `X-Mural` | testes e scripts (seed) seguem funcionando |
| `trust proxy` = loopback; rate limit por `req.ip` | o Next repassa o IP real; ninguém de fora forja o IP |
| Excluir conta = `deleted_at` + 30 dias | arrependimento/engano; login dentro do prazo restaura |
| Backup com `VACUUM INTO` (1/dia, guarda 7) | cópia consistente com o banco aberto, sem parar o servidor |
| Aparência também em `localStorage` (`mural_look`) | evita "piscar" o tema escuro antes de carregar |
| ID público `users.public_code` (XXXX-XXXX, aleatório) | convidar sem e-mail; não expõe o id interno nem quantas contas existem |
| Lista de participantes sem e-mail (só nome + ID) | quem convidou pelo ID não deve descobrir o e-mail do outro |
| Mural infinito = rolagem nativa + `scale()` (lib/useInfiniteBoard.js) | leve; durante o gesto o zoom vai direto no DOM e só no fim vira estado do React |
| Espaço livre medido em telas (`calc(… + 100vw/100vh)`) | sobra espaço para mover em qualquer zoom (em pixels do mural ele encolhia no zoom baixo) |
| Setas em tabela própria `note_links` (ON DELETE CASCADE) | some sozinha ao apagar o post-it; na lixeira só fica escondida |
| "Organizar por assunto" no back (`arrangeBySubject`) | etiqueta de 1 post-it vai para "outros" — evita dezenas de blocos de 1 |

## 6. Como rodar e testar

```bash
cd backend && npm install && npm run dev      # API em 127.0.0.1:4000
cd frontend && npm install && npm run dev     # HTTPS em https://localhost:3000 e https://SEU_IP:3000
cd backend && npm test                        # 64 testes (banco temporário)
cd backend && npm run seed -- <email> <senha> # dados de exemplo (6 pastas, 40 post-its)
```

Certificado no Windows (já feito pelo dono): `certutil -user -addstore Root "frontend\certs\ca.pem"`
(remover: `certutil -user -delstore Root "Mural de Notas - CA local"`). No celular: instalar
`https://SEU_IP:3000/mural-ca.crt` (passo a passo no README).

## 7. Estado do ambiente (29/10/2026)

- Servidores de dev **ligados** no notebook (backend e frontend) — desligar ao encerrar.
- CA "Mural de Notas - CA local" instalada pelo dono no Windows (raiz confiável do usuário).
- **Firewall do Windows não foi alterado** (regras do Node já existiam; só foram lidas).
- Banco local tem contas de teste: "Teste E2E", "Teste Recursos", "Ana Teste", "Beto Teste" (+ a do seed).
  Para zerar: parar o backend e apagar `backend/data/`.
- Rede Wi-Fi do PC: `192.168.3.21` (pode mudar; o certificado se refaz sozinho).

## 8. Erros / pendências conhecidas

Nenhum erro bloqueante aberto: 64/64 testes, build ok, sem erros de código no console.
Limitações e pontos de atenção:

- **Aviso de certificado em celulares de outras pessoas**: só some instalando a CA ou publicando com domínio real.
- **Notificações só com a aba aberta** (não há push com o app fechado).
- **Cursor ao vivo não existe no celular** (sem mouse); presença e mudanças ao vivo funcionam.
- **Ao vivo testado em duas abas do mesmo PC**, não em dois aparelhos físicos.
- **Reordenar pastas arrastando a alça ⠿** foi testado pela API, não com arrasto real automatizado.
- **Convidado não recebe alertas** das datas dos post-its da pasta compartilhada (só o dono).
- Subpastas de uma pasta compartilhada **não** são compartilhadas junto.
- Sessões antigas (token sem hash) caíram: cada pessoa entra de novo uma vez.
- Durante os 30 dias de uma conta excluída, convidados das pastas compartilhadas dela ainda as veem.
- Post-its não são criptografados (o aviso de excluir conta recomenda gerenciador de senhas).
- `--experimental-https` do Next é recurso experimental (só para desenvolvimento).
- Avisos LF/CRLF do git no Windows (inofensivos). `frontend/AGENTS.md` é gerado pelo `next dev`.
- Firefox/Safari não testados; virada de meia-noite com a página aberta não testada ao vivo.

## 9. Próximos passos sugeridos

1. **Publicar** (sem Oracle): Cloudflare Tunnel para demonstração rápida; para valer, um host com disco
   persistente para o SQLite (Render, Railway, Fly.io) + domínio → HTTPS público sem aviso.
2. **PWA + notificações push** (alerta com o app fechado; ícone na tela inicial).
3. **Telas de "esqueci minha senha" e "entrar com Google"** (backend pronto; falta SMTP e Client ID).
4. Alertas também para convidados de pastas compartilhadas; opção de compartilhar com subpastas.
5. Testes de tela automatizados (Playwright) no PC e no celular + GitHub Actions rodando `npm test` a cada push.
