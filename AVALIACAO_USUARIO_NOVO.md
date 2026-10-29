# 🧪 Avaliação como usuário novo — Mural de Notas (29/10/2026)

**Como foi feito:** saí da conta, apaguei os dados do navegador e usei o site como alguém que nunca o viu:
login → erro de login → cadastro → mural vazio → primeiro post-it → pastas, busca, calendário →
configurações → teclado (TAB/Esc) → celular (375×812, toque). Conta de teste: "Maria Nova".

Cada item diz **o que vi**, **por que importa** (heurística de Nielsen / princípio de design das aulas
de IHC) e **o que sugiro**. Prioridade: 🔴 urgente · 🟠 importante · 🟡 melhoria · 🎨 visual.

---

## 🔴 Urgente (atrapalha ou impede o uso)

| # | O que vi | Por que importa | Sugestão |
|---|---|---|---|
| U1 | **No celular, tocar no post-it não faz nada.** Para editar é preciso achar o ⋯ e depois "Editar". | Affordance: um post-it "parece" algo que se toca para abrir. Heurística 7 (eficiência): a ação mais comum leva 2 toques escondidos. | Toque simples no post-it (fora da checklist/links) abre a edição. |
| U2 | **Botões de toque minúsculos**: o ⋯ do post-it tem **25×24 px** (no PC os ✏️ 📌 ⋯ têm 33×25). | Acessibilidade (motora, tremores — slide de deficiências) e WCAG "Operável": o mínimo recomendado é **44×44 px**. | Área de toque de 44 px (pode ser invisível em volta do ícone). |
| U3 | No celular o ⋯ do post-it aparece como um **quadradinho branco quase invisível**. | Princípio de visibilidade: se a pessoa não vê, ela não sabe que existe. | Ícone escuro com contraste sobre o papel colorido (ex.: ⋯ preto 60%). |
| U4 | Os botões ✏️ 📌 ⋯ ficam **por cima do título** do post-it ("Ligar para o…" passa por baixo). | Heurística 8 (estética): informação importante coberta. | Reservar espaço à direita do título (padding) ou deixar os botões numa faixa acima. |

## 🟠 Importante (interface)

| # | O que vi | Por que importa | Sugestão |
|---|---|---|---|
| I1 | Quem entra pela 1ª vez vê **"Bem-vindo de volta"**, sem o nome do app nem para que ele serve. | Heurística 2 (mundo real) e golfo de avaliação de Norman: "onde estou? isso é para mim?". | Título "Mural de Notas" + uma frase ("Seus post-its, lembretes e datas num só lugar") e botão **"Criar conta grátis"** tão visível quanto "Entrar". |
| I2 | Formulário de novo post-it mostra **tudo de uma vez**: checklist, etiquetas, foto, 6 cores e data. | Heurística 8 (minimalista) e capacidade de aprendizagem: na 1ª nota é muita decisão. | Mostrar só **título + texto + cor**; o resto em botões pequenos "☑ Checklist · 🏷 Etiqueta · 📷 Foto · 📅 Data" que abrem o campo quando clicados. |
| I3 | Campos (título, nota, checklist, etiquetas) **sem rótulo** — só texto de exemplo dentro. A dica "Mínimo 6 caracteres" da senha também é só placeholder e some ao digitar. | Slide "Placeholder": não substitui o `<label>`; confunde pessoas com problema de memória e leitores de tela. | `<label>` (pode ser visualmente discreto) + dica da senha fixa embaixo do campo. |
| I4 | Erro "O post-it precisa de um título" aparece como **balão longe do campo**. | Heurística 9 (ajudar a reconhecer o erro): o aviso deve estar onde está o problema. | Borda vermelha no campo + mensagem logo embaixo dele (e foco volta para o campo). |
| I5 | **Sem botão "mostrar senha"** no login e cadastro. | Heurística 5 (prevenção de erros): no celular é fácil errar a senha sem ver. | Ícone 👁 dentro do campo de senha. |
| I6 | **Não existe nenhuma ajuda de primeira vez.** Duplo clique para editar, arrastar, pastas, Ctrl+K… nada é apresentado. | Heurística 10 (ajuda) e capacidade de memorização. | Mini-tour de 3 passos na 1ª vez (pode pular) **ou** 3 post-its de exemplo já colados ("👋 Clique em mim para editar", "Arraste-me", "Use 📁 para pastas"). |
| I7 | Os 3 ícones do topo (📅 🔍 ⚙️) **não têm nome escrito** (só aparece ao passar o mouse, e no celular nunca). | Heurística 6 (reconhecer em vez de lembrar). | No PC, nome ao lado ("Buscar", "Calendário"); no celular, deixar como está mas com dica no tour. |
| I8 | Configurações com **8 seções e ~4 telas de rolagem**; "Aparência", "Imersão" e "Conforto visual" parecem a mesma coisa. | Heurística 4 (consistência) e 8. | Juntar em 4 grupos: **Aparência** (tema, letra, contraste, fundo animado, conforto) · **Mural e clima** · **Sons e foco** · **Conta**. Seções recolhíveis. |
| I9 | Ao fechar a busca/calendário com Esc, o **foco do teclado se perde** (vai para a página toda). | WCAG "Operável" / teste de TAB do slide. | Devolver o foco ao botão que abriu o painel. |
| I10 | O **contorno de foco** (TAB) é o padrão fininho do navegador (0,8 px), quase invisível no fundo preto. | Visibilidade + acessibilidade para quem usa teclado. | Contorno amarelo de 3 px em todos os botões (já existe no alto contraste — usar sempre). |
| I11 | O botão **+** (ação principal) é o **último** na ordem do TAB. | Heurística 7 (eficiência). | Atalho **N** = novo post-it, mostrado no título do botão ("Novo post-it (N)"). |
| I12 | O primeiro post-it nasce **colado no canto** (PC: quase encostando no topo; celular: 13 px do clima, com a fita por cima). | Heurística 8 (estética e respiro). | Primeiro post-it no centro da área livre; no celular, 24 px de distância do clima. |

## 🎨 O que está feio na parte visual

| # | O que vi | Sugestão |
|---|---|---|
| V1 | **Emojis como ícones** (🌙 ☀️ 🔄 📌 ✏️…): cada sistema desenha diferente; o 🌙 do tema "Escuro", pequeno sobre o amarelo, parece um **dedinho**. Mistura de emojis coloridos com ícones de linha (📅 🔍 ⚙️ são SVG). | Usar **um só estilo de ícones** (SVG de linha, ex.: Lucide) nos botões e deixar emoji só para o conteúdo do usuário (ícone de pasta, etiqueta). Princípio de consistência. |
| V2 | Botões da barra de baixo (zoom "− 100% +", "⋯ Mais") **pequenos e apagados** no tema escuro comparados ao + amarelo gigante. | Mesma altura (44 px) e mesmo estilo de vidro do topo; o + pode diminuir um pouco (56 px). |
| V3 | Tela de login: post-its decorativos **cortados e pequenos** nos cantos, parecem erro de carregamento. | Ou maiores e inteiros (inclinados, com sombra), ou tirar. |
| V4 | Muitos tamanhos de canto arredondado (10, 12, 14, 16, 18, 22 px) e de sombra diferentes. | Padronizar em 2–3 valores (ex.: 10 / 14 / 20) e 2 sombras. |
| V5 | Clima recolhido no PC vira uma caixa grande com **pouca informação** (17 °C + hora) ocupando o canto. | Versão compacta em "pílula" (☁ 17° · 01:28) do mesmo tamanho dos botões do topo. |
| V6 | Contraste de textos secundários (cinza sobre preto, ex.: "Clique no botão + para colar…") baixo. | Clarear o `--muted` no tema escuro até contraste 4,5:1 (WCAG AA). |

## 🟡 Melhorias e ideias

- **Desfazer também no celular**: o "Desfazer" do balão some rápido; deixar 8 s e com botão maior.
- **Feedback ao salvar** (heurística 1): além do balão "Post-it criado!", o post-it novo podia piscar/brilhar 1 s para a pessoa ver *onde* ele caiu.
- **Estado vazio** podia ter um botão "Criar meu primeiro post-it" no meio da tela (além do + no canto).
- **Localização do clima**: quando a pessoa nega, usa São Paulo; mostrar no próprio widget "📍 São Paulo (padrão) · trocar".
- **Termos e privacidade (LGPD)** no cadastro: uma linha "Ao criar a conta você concorda com…" com link para uma página simples.
- **Senha**: indicador de força simples (fraca/boa/forte) em vez de só "mínimo 6".
- **Teste com pessoas reais** (slide "Teste de usabilidade"): 3–5 pessoas, 4 tarefas ("crie um lembrete para sexta", "mova para uma pasta", "ache a nota do dentista", "recupere um post-it excluído"), anotando onde travam.

## ✅ O que já está bom (manter)

- Mensagens de erro em português simples ("E-mail ou senha incorretos.", "A senha precisa ter pelo menos 6 caracteres.").
- O back valida tudo: um post-it sem título é recusado mesmo se o front deixar passar (400).
- Título já vem em foco ao abrir "Novo post-it"; cores com nome para leitor de tela.
- Painel de pastas explica para que servem ("crie pastas como Faculdade…").
- Busca explica o que entende (datas, #etiquetas) e mostra o atalho Ctrl+K.
- Esc fecha painéis; ordem do TAB segue a ordem visual.
- Depois da rodada de IHC: nada se sobrepõe no PC nem no celular, sem rolagem para o lado.

---

### Ordem sugerida para arrumar

1. **U1–U4** (toque no celular e botões do post-it) — rápido e é o que mais incomoda.
2. **I1, I2, I4, I5** (primeira impressão, formulário mais simples, erro no campo, mostrar senha).
3. **V1** (um só estilo de ícones) + **I10** (foco visível) — mudam muito a cara do app.
4. **I6** (ajuda de primeira vez) e **I8** (configurações agrupadas).
5. O resto aos poucos.

---

## ✅ Corrigido em 29/10/2026 (urgentes + importantes escolhidos)

| # | O que mudou | Conferido |
|---|---|---|
| U1 | No toque, **um toque no post-it abre a edição** (checklist, links, ⋯ e o arrasto continuam funcionando normalmente). | Celular 375×812: toque → "Editar post-it" |
| U2 | ⋯ do post-it com **34 px de desenho e 46 px de área de toque**; no PC os botões passaram a 30×30. | Medido no navegador |
| U3 | ⋯ agora é **escuro sobre o papel** (bem visível). | Print do celular |
| U4 | No PC os botões ficam numa **faixa acima do título**; no toque o título reserva espaço para o ⋯. | Botões terminam em 199 px, título começa em 204 px |
| I1 | Tela de entrar mostra **"Mural de Notas"**, para que serve, e um botão **"Criar conta grátis"** tão visível quanto "Entrar". | Print do PC |
| I2 | Novo post-it mostra só **título + texto + cor**; "Adicionar: ☑️ Checklist · 🏷️ Etiqueta · 📷 Foto · 📅 Data" abre cada campo quando a pessoa pede (ao editar, o que o post-it já usa aparece aberto). | Criado post-it com data pelo botão 📅 |
| I3 (parte) | Título e texto ganharam rótulo para leitor de tela; a dica da senha fica **fixa embaixo do campo** e conta quantos caracteres faltam. | — |
| I4 | Erro do título aparece **embaixo do campo**, com borda vermelha, exemplo de como preencher e o cursor volta para o título. O back continua sendo quem valida. | Sem balão, foco no título |
| I5 | Botão 👁 **mostrar/esconder senha** (44 px) no entrar e no cadastro. | Alterna e volta |
