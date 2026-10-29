# 👥 Teste em grupo — 5 estudantes usando a mesma pasta ao mesmo tempo (30/10/2026)

**Cenário:** grupo de TCC "App de Caronas" com 5 integrantes — **Maria** (dona da pasta), **João**, **Ana Clara**,
**Bruno** e **Carol** — guardando dados importantes da pesquisa (respostas do questionário, referências ABNT,
cronograma, acesso ao laboratório, banca, repositório) numa pasta compartilhada. Todas as contas são reais no
banco local; os convites foram feitos **pelo ID** de cada pessoa.

**Como foi testado**

1. **Script com as 5 pessoas** (`backend/scripts/teste-grupo.mjs`): cada uma faz login e usa a API de verdade,
   **disparando os pedidos ao mesmo tempo** (`Promise.all`) — 280 pedidos no total, 14 cenários.
2. **Navegador com 3 pessoas logadas de verdade**, cada uma numa aba com endereço diferente (o login fica
   guardado por endereço): Maria em `https://localhost:3000`, João em `https://127.0.0.1:3000` e Ana em
   `https://192.168.3.21:3000`. **Bruno e Carol** ao mesmo tempo pelo script (`colegas-ao-vivo.mjs`):
   cursores andando, post-its novos, post-it arrastado e tarefa marcada.

## Resultado: 20 ✅ · 0 ❌ · 5 ⚠️ achados

| Cenário | Resultado |
|---|---|
| 5 pessoas entram ao mesmo tempo | ✅ |
| Dona convida 4 colegas **pelo ID** no mesmo instante | ✅ 4/4, lista com nome + ID, **nenhum e-mail** |
| As 5 abrem a pasta ao vivo | ✅ a dona vê 5 online |
| **30 post-its colados ao mesmo tempo** por 5 pessoas | ✅ 30/30 em 367 ms, nada duplicado nem perdido |
| Post-its do grupo ficam com a dona (não somem se alguém sair) | ✅ |
| **Checklist com 10 tarefas marcadas por 5 pessoas no mesmo instante** | ✅ 10/10, nenhuma marcação perdida |
| 5 pessoas arrastam o mesmo post-it juntas | ✅ sem erro |
| Colega exclui por engano e clica em **Desfazer** | ✅ sumiu para todos e voltou |
| Busca do convidado acha post-its do grupo | ✅ |
| Calendário do convidado mostra as datas do grupo | ✅ |
| Convidado **não** consegue renomear/apagar a pasta, convidar, tirar colega nem levar post-it embora | ✅ 403/404 em todos |
| **Carga:** 180 pedidos de 5 pessoas de uma vez (listar, arrastar, cursor, buscar, criar) | ✅ 0 erros · p50 1,1 s · p95 1,6 s |
| Mudanças chegam ao vivo para todos | ✅ ~92 avisos para cada um |
| Cursores dos colegas aparecem ao vivo | ✅ |
| Ninguém recebe aviso da própria mudança | ✅ |
| Dona tira a Carol do grupo | ✅ conexão dela fecha na hora; ver/editar/buscar bloqueados |
| O que a Carol escreveu continua no grupo | ✅ |
| Erros do servidor (5xx) | ✅ **0 em 280 pedidos** |
| **No navegador:** post-it colado pelo João (botão +), tarefa desmarcada pela Ana e post-its do Bruno e da Carol aparecem sozinhos na tela da Maria | ✅ |

## ⚠️ Achados (o que precisa melhorar)

| # | Gravidade | O que acontece | Por que importa num trabalho em grupo | Sugestão |
|---|---|---|---|---|
| G1 | 🔴 **Alta** | **Duas pessoas editam o mesmo post-it: vale só quem salvou por último**, sem aviso. No teste, João, Ana e Bruno salvaram "Dados da pesquisa" juntos e ficou só a versão do Bruno. | Dado importante (ex.: número de respostas do questionário) some sem ninguém perceber. | Guardar a "versão" do post-it; se mudou desde que a pessoa abriu, o back recusa (409) e a tela mostra "A Ana mudou este post-it enquanto você editava" com as opções **Ver a versão dela** / **Salvar a minha mesmo assim**. |
| G2 | 🔴 **Alta** | **Janela de edição aberta = cópia velha.** O João abriu "Divisão de tarefas", nesse meio tempo a Ana desmarcou 2 tarefas e o Bruno escreveu "API atrasada 1 semana"; quando o João salvou (só mudou o título), **apagou as duas mudanças**. | É o jeito mais comum de perder trabalho: alguém deixa a janela aberta e salva depois. | Mesmo conserto do G1. Extra: se chegar aviso ao vivo de mudança no post-it aberto, mostrar uma faixa "Alguém mudou este post-it — recarregar". |
| G3 | 🟠 Média | **Backup de convidado não inclui o grupo.** O "Baixar backup" do João não traz nada da pasta do TCC — nem o que ele mesmo escreveu lá. | Quem não é dono acha que tem cópia dos dados do grupo e não tem. Se a dona excluir a conta, o grupo perde tudo depois de 30 dias. | Incluir no backup as "Pastas compartilhadas comigo" (marcadas como cópia) e avisar na tela de excluir conta da dona que os convidados perdem o acesso. |
| G4 | 🟠 Média | **Lembretes do grupo só chegam para a dona.** A "Reunião com orientador" (criada pelo João) não avisa a Ana nem o próprio João. | Em grupo, todos precisam do lembrete da reunião e da entrega. | Alertas também para quem participa da pasta (já estava na lista de próximos passos). |
| G5 | 🟡 Baixa | **Lixeira de quem excluiu.** Se a Carol exclui um post-it do grupo, ele vai para a lixeira da **dona**, não para a dela. Passado o "Desfazer", só a Maria consegue recuperar. | Quem errou não consegue consertar sozinho. | Mostrar na lixeira de cada um "Excluídos por mim em pastas compartilhadas" com opção de restaurar. |
| G6 | 🟡 Baixa | Ícone de pasta fora da lista (ex.: 🎓) é trocado por 📁 **sem avisar**. | Pequena surpresa ("cadê meu ícone?"). | Avisar "ícone não disponível" ou aceitar qualquer emoji. |
| G7 | 🟡 Baixa | Com **muitos post-its** (56) no modo livre, os de cima ficam por baixo da barra do topo e do clima. | Parece bagunçado e esconde anotações. | Ao abrir a pasta, rolar para a primeira anotação ou começar o mural abaixo da barra; botão "Arrumar" já resolve. |

## 🔧 Corrigido durante o teste

| O que estava errado | Correção |
|---|---|
| **Bolinhas de "quem está online" sumiam**: com 4 colegas na pasta, a Maria via só "JC" (as outras ficavam espremidas com largura 0 quando o topo estava apertado). | As bolinhas não encolhem mais; em telas até 1100 px aparece **"4 online"** no lugar. Conferido: 1366 px mostra JC · AC · BL · +1; 606 px mostra "2 online" / "4 online". |
| Abrir o site por `https://127.0.0.1:3000` (para ter outra conta logada) deixava a página sem funcionar — o servidor de **desenvolvimento** do Next bloqueia esse endereço por padrão. | Liberado `127.0.0.1` em `allowedDevOrigins` (só vale em desenvolvimento). |

## ⏱️ Desempenho

- 30 post-its criados ao mesmo tempo: **367 ms** para todos.
- 180 pedidos simultâneos: **p50 1,1 s · p95 1,6 s · pior 1,6 s**, sem erros. Para 5 pessoas usando de verdade
  (bem menos que 180 pedidos no mesmo segundo) é folgado; o tempo vem de o servidor atender um pedido por vez
  (SQLite síncrono). Para turmas grandes valeria medir de novo.
- O mural junta avisos seguidos (espera 250 ms) antes de recarregar: 90 avisos ao vivo **não** viram 90 recargas.

## Como repetir

```bash
cd backend && npm run dev                            # servidor ligado
cd backend && npm run teste:grupo                    # 5 estudantes, 14 cenários (cria a pasta do TCC)
cd backend && npm run teste:ao-vivo -- <id da pasta> 240   # Bruno e Carol mexendo por 4 min
```

Para **ver no navegador**: abra três abas — `https://localhost:3000`, `https://127.0.0.1:3000` e
`https://SEU_IP:3000` — e entre com uma conta diferente em cada. As senhas de teste geradas ficam em
`backend/data/contas-grupo.json` (pasta que nunca vai para o GitHub). Se Maria e João já existirem com outra
senha, passe `MARIA_PASS=... JOAO_PASS=...` antes do comando.

---

## ✅ Achados corrigidos (30/10/2026) — teste repetido: **25 OK · 0 falhas · 0 achados**

| # | Como ficou | Conferido |
|---|---|---|
| G1/G2 | Cada post-it tem **versão** (sobe a cada mudança de texto, checklist ou data; arrastar não conta) e guarda **quem mudou por último**. Ao salvar, o app manda a versão que abriu: se alguém mudou no meio tempo, o back recusa (409) em vez de apagar. Na janela aparecem: 1) uma faixa **"Ana Clara acabou de mudar este post-it" → Carregar a versão nova** assim que a mudança chega ao vivo; 2) ao salvar mesmo assim, uma caixa com **a versão da outra pessoa** e as opções **Usar a versão de Ana** / **Salvar a minha mesmo assim**. Conflito consigo mesmo (outra aba) tem mensagem própria. | Script: 3 pessoas salvando juntas → 1 salva, 2 são avisadas; cópia velha do João → recusada, nada perdido. Navegador: João viu a faixa, depois a caixa, usou a versão da Ana, acrescentou a dele e salvou — ficou `131 respostas (Ana conferiu a planilha) · … · João: revisar gráfico 3`. |
| G3 | O backup de quem participa traz as **pastas compartilhadas** (marcadas com a dona) e seus post-its; importar cria **"Nome (cópia do grupo)"** na conta de quem importou. | Teste automático + script. |
| G4 | **Lembretes das pastas do grupo chegam para todos** que participam; quando alguém fecha o aviso, fecha **só para essa pessoa** (tabela `alert_dismissals`). | Teste automático (Igor fecha, Helena continua vendo; quem é de fora não recebe nem fecha). Navegador: "Próximas datas" do João mostra as reuniões do grupo. |
| G5 | O que um convidado exclui aparece **na lixeira dele também** ("pasta de Maria"), com **Restaurar**; apagar de vez continua só com a dona. A contagem da lixeira inclui esses itens. | Teste automático + script. |
| G6 | Ícone de pasta aceita **qualquer emoji** (🎓, 👩‍💻, 👍🏽…); o que não for emoji recebe "O ícone da pasta precisa ser um emoji". 🎓 e 📝 entraram na lista da tela. | Teste automático. |
| G7 | O mural livre começa **abaixo da barra do topo** (76 px), com o cursor ao vivo e a posição de post-it novo ajustados. | 1366×768: 0 de 51 post-its atrás da barra. |

Carga (180 pedidos de uma vez) nesta rodada: **p50 ≈ 290 ms · p95 ≈ 510 ms**, 0 erros.
