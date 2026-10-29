# ✅ Relatório de testes — Mural de Notas

Data: 27/10/2026 · Ambiente: Windows 11, Node 24, Next.js 16, HTTPS local (`npm run dev` no frontend,
acessado em `https://localhost:3000`)

## 1. Testes automáticos da API (`npm test` na pasta `backend`)

Sobem o backend numa porta própria com um **banco temporário** (o banco real não é tocado).
**Resultado: 25 de 25 passando.**

| Área | O que é verificado |
|------|--------------------|
| Datas | datas impossíveis recusadas (29/02 em ano não bissexto, mês 13), contagem anual/única, fuso inválido não quebra |
| Cadastro/login | token gerado, senha nunca devolvida, e-mail repetido (até com maiúsculas), validações, mesma mensagem para senha errada e e-mail inexistente, logout invalida o token |
| Post-its | criar, listar, editar, mover (não sai da tela), apagar, validações, cor inválida vira amarela, aniversário sempre anual, texto com cara de SQL/HTML salvo como texto |
| Alertas | aniversário de hoje com idade, fechar some só hoje, mudar a data reativa o alerta, próximos 7 dias |
| Pastas | criar, nome repetido, validações, ícone inválido, contadores, mover post-it, apagar pasta devolve os post-its ao Mural geral |
| Busca | sem acento, várias palavras, todas as pastas, título pesa mais, busca vazia |
| Privacidade | um usuário **não** vê, edita, move, apaga ou busca post-its/pastas de outro |
| Configurações | padrões, valores inválidos recusados sem estragar os salvos, chaves desconhecidas ignoradas, troca de nome |
| Robustez | rota inexistente, JSON quebrado, CORS só para o front/rede local, coordenadas de clima inválidas |

## 2. Teste de uso no navegador — PC (1280×800, 1024×768 e tablet 768×1024)

Feito com um usuário novo, do cadastro até sair da conta, com 25 post-its em 3 pastas.

- [x] Sem login → vai para `/login`; senha curta mostra erro; cadastro leva ao mural vazio com boas-vindas
- [x] Post-it sem título é recusado e o modal continua aberto para corrigir
- [x] Criar post-its com cor; aniversário de hoje abre alerta com confete e "Completando 31 anos"
- [x] Fechar o alerta → recarregar → ele não volta
- [x] Arrastar post-it → recarregar → continua no lugar novo
- [x] Editar (✏️), excluir em 2 cliques ("Certeza?"), Esc fecha o modal
- [x] Criar pasta com nome e ícone, abrir, post-it nasce na pasta aberta, renomear, apagar
- [x] "Faltam 3 dias" no post-it e em "Próximas datas"
- [x] Ctrl+K abre a busca; "relatorio diretoria" acha "Entrega do relatório" em outra pasta, troca de pasta e destaca
- [x] Configurações (°F, chuva, menos poluição visual, filtro de luz azul, cores suaves, sem segundos) continuam após recarregar
- [x] Sair → senha errada mostra erro → entrar de novo traz os post-its
- [x] Nenhum elemento do topo se sobrepõe ao clima; sem rolagem lateral; nenhum erro de código no console

## 3. Teste de uso no navegador — celular (375×812, toque)

- [x] Grade de 2 colunas, todos os post-its cabem na largura, sem rolagem lateral
- [x] Topo cabe na tela e não encosta no clima; clima começa recolhido e expande ao tocar
- [x] Botões ✏️/🗑️ sempre visíveis (sem hover no toque); botões principais com 40px ou mais
- [x] "Próximas datas" começa como pílula e abre ao tocar
- [x] Pastas, busca, novo post-it, configurações e alerta abrem **dentro** da tela
- [x] Lista de pastas fecha ao tocar fora; configurações rolam quando o conteúdo é maior
- [x] Busca "calculo" acha "Prova de Cálculo", troca para "Faculdade" e o post-it fica visível
- [x] Criar e excluir post-it pelo celular; lembrete de hoje abre alerta que cabe na tela
- [x] Na grade o dedo rola a página normalmente (`touch-action: manipulation`)
- [x] Login e cadastro cabem na tela, sem os post-its decorativos

## 4. Problemas encontrados e corrigidos nesta rodada

- `npm run seed` chamava `localhost:4000`, que no Windows pode ir para IPv6 e falhar agora que o
  backend escuta só em `127.0.0.1` → passou a usar `127.0.0.1`.

## 5. O que **não** foi testado aqui

- Um celular físico (o teste foi com emulação de celular no navegador). Vale abrir
  `https://SEU_IP:3000` no seu aparelho e fazer o roteiro da seção 3.
- Notificação do navegador e localização real (dependem da permissão no aparelho).
- Virada de meia-noite com a página aberta (a lógica existe: o app confere a cada minuto).
- Navegadores Firefox e Safari.

---

# ✅ Rodada 2 — Lixeira, desfazer e organização (27/10/2026)

**Testes automáticos: 37 de 37 passando** (12 novos).

| Área | O que é verificado |
|------|--------------------|
| Lixeira | excluir some do mural, dos alertas e da busca; aparece na lixeira (30 dias); não dá para editar; restaurar; apagar de vez só da lixeira; esvaziar |
| Arquivar/fixar | arquivado sai do mural, vai para Arquivados, aparece na busca e volta |
| Checklist | itens vazios descartados, marcar item, limite de 30, formato inválido |
| Etiquetas | normaliza (#Urgente → urgente), sem repetidas, máx. 6, caracteres inválidos, busca `#etiqueta` |
| Duplicar / tamanho | copia texto, checklist, etiquetas e foto, desloca 30px; tamanho com limites |
| Lote / arrumar | mover, arquivar e excluir vários; ações inválidas; fixados primeiro na grade; outro usuário não consegue usar lote nos seus post-its |
| Foto | enviar, ler, duplicar, remover; arquivo falso recusado; **sem login = 401**; navegador não guarda a foto em cache; outro usuário não vê |

**No navegador (PC 1280px e celular 375px):** checklist marcando direto no post-it (0/3 → 1/3), link abre em
nova aba com `noopener`, filtro por etiqueta ("2 de 5"), fixar, excluir → Desfazer, excluir → Ctrl+Z, arquivar,
Lixeira e Arquivados com restaurar, duplicar, selecionar 2 → mover para pasta, selecionar todos → excluir →
Desfazer, foto de 5,3 MB enviada com 15 KB, zoom 80% com arrasto correto (160px na tela = 200px no mural),
redimensionar, arrumar em grade. No celular: fixado em 1º, menu ⋯, barra de seleção e formulário cabem na tela,
sem rolagem lateral; zoom/arrumar/redimensionar ficam só no PC.

**Problema encontrado e corrigido:** a foto ficava 5 minutos no cache do navegador — em PC compartilhado,
outra pessoa no mesmo navegador poderia vê-la sem login. Agora a API manda `Cache-Control: no-store` e o app
esquece as fotos ao sair da conta.

---

# ✅ Rodada 3 — Pastas compartilhadas, lembretes e busca avançada (29/10/2026)

**Testes automáticos: 51 de 51 passando** (14 novos).

| Área | O que é verificado |
|------|--------------------|
| Datas | semanal (mesmo dia da semana), mensal (dia 31 → último dia), começa só na data original, ocorrências num período |
| Lembretes | etapa "aviso antecipado" e "na hora" (15 min antes, 1 dia antes); validação de horário/aviso/repetição; fechar cada etapa |
| Calendário | ocorrências repetidas no mês certo; mês inválido |
| Subpastas | até 3 níveis, sem ciclo, nome repetido só no mesmo nível, reordenar, apagar pasta sobe as subpastas |
| Compartilhar | convite por e-mail (inexistente, a si mesmo, repetido, convidado não convida), convidado vê/edita/exclui e desfaz, dono vê tudo, e-mails escondidos do convidado, convidado não renomeia nem leva post-its embora, intruso não vê nada |
| Ao vivo | presença das duas pessoas, cursor chega para o outro (não volta para si), aviso de mudança, sair da pasta corta o acesso |
| Busca | filtros cor/pasta/etiqueta/com data, "dezembro" e "25/12/2026" (inclui aniversário que repete) |

**No navegador, com duas pessoas ao mesmo tempo (Ana em `https://localhost:3000`, Beto em `https://192.168.3.21:3000`):**
alerta "Agora: 00:27" e "🔔 Daqui a 30 min", calendário (out: 5, 29, 30; nov: quintas da academia semanal),
árvore Faculdade › Cálculo/TCC, busca "novembro"/"amanhã"/#viagem + azul, buscas recentes, arrastar post-it até
"TCC" pela faixa de pastas (+ Desfazer), convite pela janela 👥 (erro para e-mail inexistente), Beto vê a pasta em
"Compartilhadas comigo", **cursor do Beto com nome aparecendo na tela da Ana**, post-it criado/editado pelo Beto
aparecendo na Ana sem recarregar, Beto não consegue mover post-it para fora (403). Celular: topo, pastas,
calendário, busca com filtros e formulário com os campos novos cabem na tela.

**Ajustes feitos durante os testes:** painel de pastas agora fecha ao abrir "compartilhar"; aviso de "movido" com
ícone 📁; nome da pasta com mais espaço no topo do celular; testes não abrem mais o banco real.

**Não testado:** dois aparelhos físicos diferentes (foram duas abas no mesmo PC), notificação do navegador fora da aba.

---

# ✅ Rodada 4 — Visual, acessibilidade, conta e segurança (29/10/2026)

**Automáticos:** `npm test` → **60/60 passando** (novos: cookie seguro e suas flags, bloqueio CSRF sem
`X-Mural`, migração de token antigo, 429 após tentativas, trocar senha, esqueci/redefinir senha,
exportar/importar backup, excluir e restaurar conta, backup do banco, validação das novas configurações).
**Build:** `next build` ok (rotas `/`, `/login`, `/cadastro`, `/exportar`).

**Navegador (PC):**
- Cadastro pela tela → sessão só no cookie (JS não enxerga; nada de token no `localStorage`).
- Pedido sem `X-Mural` → 403. Backup baixado como `mural-de-notas-backup-AAAA-MM-DD.json` com pastas e post-its.
- Tema claro, letra A++ (20,8 px), alto contraste, sons, timer de foco: tudo aplicado na hora.
- Timer: contou (24:58), tempo aparece no título da aba, pausar congela o tempo.
- Previsão de 5 dias aparece no clima (Hoje + 4 dias, máx/mín e chuva).

**Navegador (celular 375×812):** timer ocupa a largura toda acima das ferramentas, sem cortar.

**Corrigido nesta rodada:**
- Alto contraste deixava borda dupla e torta no seletor "Mural geral" (borda no invólucro e no botão).
- No celular o timer de foco saía pela direita e cobria o zoom.

**Não testado:** impressão real do PDF, exclusão de conta pela tela (testada pela API), e-mail e Google (sem tela).

## Rodada 4b — Menos poluição visual (avaliação heurística de IHC)

Avaliação feita com as **10 heurísticas de Nielsen** e os **princípios de design** (visibilidade,
consistência, feedback, affordance) das aulas de IHC. Problemas encontrados e o que foi feito:

| Problema (antes) | Heurística | Solução |
|---|---|---|
| Timer de foco ficava **por cima** do botão "Selecionar" no PC | 8 · Projeto minimalista / 4 · Consistência | O timer agora entra **na mesma barra** do zoom, ao lado — nunca sobrepõe |
| Barra de baixo com zoom + Arrumar + Foco + Selecionar (4 itens) | 8 · Projeto minimalista | À vista só o zoom (PC); o resto foi para **"⋯ Mais"**, cada opção com nome e explicação curta (6 · Reconhecer em vez de lembrar) |
| No celular, 4 camadas empilhadas embaixo (timer, zoom, datas, +) | 8 | Uma linha só: **[Próximas datas] [⋯] [+]**; o timer, se ligado, fica numa faixa logo acima; zoom vai para dentro do "Mais" |
| Cada post-it mostrava ✏️ 📌 ⋯ o tempo todo no celular | 8 | No toque fica só o **⋯**; "Editar" e "Fixar" estão dentro do menu (no PC continuam aparecendo ao passar o mouse) |
| "Faltam 2 dias" encavalava com o horário no post-it | 8 / legibilidade | A etiqueta desce de linha quando falta espaço |
| Timer com 4 botões (▶ ↺ – ✕) | 8 | "Minimizar" saiu (fazia o mesmo que fechar, o tempo fica guardado); "↺" só aparece depois que o tempo começou |
| Botão "N" do Next cobrindo "Próximas datas" | 8 | Desligado (`devIndicators: false`) — só existia em desenvolvimento |
| Alto contraste: borda dupla e torta no seletor "Mural geral" | 4 · Consistência | Borda só no botão, igual aos outros |

**Verificado no navegador:** PC (1366×768) e celular (375×812, toque): nenhum elemento fixo
se sobrepõe a outro (conferido por script com as caixas de cada elemento), sem rolagem lateral,
menu "Mais" com 3 opções escritas, menu do post-it com Editar/Fixar no celular. `next build` ok.
