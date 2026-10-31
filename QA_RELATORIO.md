# 🧪 Relatório de Qualidade de Software — Mural de Notas (30/10/2026)

Teste completo feito no notebook, com o servidor de **desenvolvimento** (`npm run dev`). Seis frentes:
testes automáticos, segurança, funcional ponta a ponta, celular, desempenho e acessibilidade.

## Placar

| Frente | Resultado |
|---|---|
| Testes automáticos do back | ✅ **81/81** em 8,9 s |
| Compilação do front | ✅ sem erros (5 rotas) |
| Bibliotecas com vulnerabilidade | ⚠️ back: **1 alta** (nodemailer) · front: 0 |
| Segurança (24 sondagens) | ✅ 16 · ❌ 8 (7 são cabeçalhos ausentes) |
| Funcional ponta a ponta (PC) | ✅ **todos os 22 passos** |
| Celular 375 px | ✅ fluxos ok · ⚠️ alvos de toque pequenos |
| Desempenho com 201 post-its | ❌ **14–31 fps** (meta: 60) |
| Acessibilidade automática | ✅ nomes, rótulos, idioma, "reduzir movimento" · ⚠️ foco fraco, sem títulos |

## 🔴🟠 Achados (do mais grave para o menos)

| # | Gravidade | Achado | Evidência | Como resolver |
|---|---|---|---|---|
| Q1 | 🟠 **Alta** | **Mural pesado com muitos post-its.** Com 201 post-its: parado 27–31 fps, zoom 17 fps, rolagem 14 fps, 20 travadas na rolagem. | Experimento: tirar o "respirar" dos post-its sobe de 31 → **50 fps**; sem nenhuma animação, 57 fps. 246 animações CSS rodando ao mesmo tempo. | Animar só os post-its **visíveis na tela** (IntersectionObserver), pausar animações durante zoom/rolagem e desligar o "respirar" acima de ~40 post-its. |
| Q2 | 🟠 Alta | **Biblioteca `nodemailer` vulnerável** (versão 6): 20+ alertas, incluindo injeção de comando SMTP e e-mail indo para domínio errado. | `npm audit` no back. Risco atual **baixo**: o e-mail de "esqueci a senha" não está ligado nem configurado. | Atualizar para a versão corrigida (`npm i nodemailer@latest`) e rodar os testes. |
| Q3 | 🟠 Média | **Faltam cabeçalhos de segurança** no front e no back: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`. | Sondagem direta. | Adicionar `headers()` no `next.config.mjs` e um middleware no Express (ou `helmet`). Protege contra clickjacking e alguns ataques de script. |
| Q4 | 🟠 Média | **Texto grande demais dá erro 500** em vez de recusar educadamente (413). | Corpo de 3 MB → 500; log: `PayloadTooLargeError` (`entity.too.large`). | Tratar `err.type === 'entity.too.large'` no `errorHandler` → 413 "Texto grande demais". |
| Q5 | 🟠 Média | **Alvos de toque pequenos no celular** (mínimo recomendado 44×44 px). | Bolinhas de cor do post-it **20×20**, "Expandir clima" **24×24**, botões do formulário 26–33 px de altura, topo 40×40. | Área de toque invisível de 44 px em volta (como já foi feito no ⋯ do post-it). |
| Q6 | 🟡 Baixa | **Demora para mostrar 201 post-its** (~6,5 s até todos aparecerem). | API responde em **57 ms**; o tempo é montagem + animação de entrada de 201 post-its no modo de desenvolvimento. | Medir no build de produção; animar a entrada só dos visíveis; virtualizar quem está muito fora da tela. |
| Q7 | 🟡 Baixa | **Contorno de foco do teclado fraco** (pendência I10 do relatório de usuário novo). | Botão + sem contorno visível ao focar. | Contorno amarelo de 3 px em `:focus-visible` para todos os botões. |
| Q8 | 🟡 Baixa | **Mural sem títulos de seção (h1/h2)** para leitor de tela navegar. | Nenhum `h1`/`h2` na tela principal. | Um `h1` visualmente escondido ("Mural — pasta X") e `h2` nos painéis. |
| Q9 | 🟡 Baixa | Servidores **se anunciam** (`X-Powered-By: Express` / `Next.js`). | Sondagem. | `app.disable('x-powered-by')` e `poweredByHeader: false`. |
| Q10 | 💡 Sugestão | Data **no começo do mês seguinte** não aparece ao abrir o calendário (ele abre no mês atual). | Prova em 01/11 vista só depois de clicar "próximo mês". | Dica no calendário: "📅 1 data no próximo mês →". |

## ✅ O que passou

**Segurança:** login exigido em tudo · token falso recusado · senha/hash nunca devolvidos · cookie de sessão
`HttpOnly` + `SameSite=Lax` · **CSRF bloqueado** (cookie sem `X-Mural` → 403) · **um usuário não lê, edita,
apaga, move, liga nem encontra na busca o post-it de outro** · **XSS:** título com `<img onerror>` salvo e
mostrado como texto (nada executou na tela) · **SQL injection** salvo como texto, banco intacto, busca
`' OR 1=1 --` sem vazamento · título de 5000 caracteres recusado · JSON quebrado → 400 · força bruta no login
bloqueada (429) · erros sem detalhes internos.

**Funcional (usuário novo no PC):** cadastro (dica de senha "✓ Tamanho ok") · mural vazio explica o que fazer ·
criar post-its com checklist, etiqueta e data · editar · marcar checklist no mural · fixar · duplicar · excluir
e **Desfazer** · arquivar · criar pasta (já abre nela) · mover post-it para a pasta · busca Ctrl+K em outra
pasta e clique leva até lá · calendário marca o dia e mostra a prova ao clicar · trocar nome · tema claro ·
baixar backup · ligar post-its **pela janela (sem arrastar)** · indicador 🔗 · lixeira: restaurar traz o
post-it **e a ligação** · sair da conta.
*(Mapa de ideias + Desfazer foi validado em detalhe no teste da rodada 8.)*

**Celular (375 px):** cadastro, mural e janela do post-it cabem sem rolagem lateral · criar pelo + · **tocar
no post-it abre a edição** · ⋯ com área de toque de 46 px.

**Acessibilidade:** `lang="pt-BR"` · nenhum botão sem nome · nenhum campo sem rótulo · nenhuma imagem sem
`alt` · ordem do TAB segue a tela · "reduzir movimento" do sistema respeitado.

## ⏱️ Números de desempenho

| Medida | Valor |
|---|---|
| Página pronta (DOMContentLoaded) | 563 ms |
| Resposta da API de post-its (201) | 57 ms |
| Criar 200 post-its pela API | 3,1 s (≈ 15 ms cada) |
| Memória JS com 201 post-its | 63 MB |
| Elementos na página com 201 post-its | ~5.900 |
| JS total do build (antes de compactar) | ~1 MB |
| FPS parado / zoom / rolagem / passar o mouse | 27 / 17 / 14 / 20 |

> Medições no servidor de **desenvolvimento**, numa aba do navegador do Claude em 1366×768. Em produção a
> carga tende a ser mais rápida; o problema de FPS (Q1) é das animações e acontece em qualquer modo.

## Ordem sugerida

1. **Q1** (desempenho com muitos post-its) — é o que o usuário sente.
2. **Q2 + Q4 + Q9** (rápidos no back: atualizar nodemailer, erro 413, esconder cabeçalho).
3. **Q3** (cabeçalhos de segurança).
4. **Q5 + Q7** (toque e foco — acessibilidade).
5. Q6, Q8, Q10.

## Dados de teste criados no banco local

Contas `qa.*@teste.dev` ("QA Ana", "QA Beto", "Quésia QA", "Celina QA" — esta com **201 post-its** e 59 fios
para o teste de carga). Só existem no banco do notebook (`backend/data/`, fora do GitHub).
