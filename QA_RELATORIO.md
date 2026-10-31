# 🧪 Relatório de Qualidade de Software — Mural de Notas (30/10/2026)

Teste completo feito no notebook, com o servidor de **desenvolvimento** (`npm run dev`). Seis frentes:
testes automáticos, segurança, funcional ponta a ponta, celular, desempenho e acessibilidade.

## Placar

| Frente | Resultado |
|---|---|
| Testes automáticos do back | ✅ **83/83** (2 novos de segurança) |
| Compilação do front | ✅ sem erros (5 rotas) |
| Bibliotecas com vulnerabilidade | ✅ **corrigido** — back: 0 (nodemailer 10.3.1) · front: 0 |
| Segurança (24 sondagens) | ✅ **23/24** (era 16) — o que falta é HSTS, que só vale em produção (e lá está) |
| Funcional ponta a ponta (PC) | ✅ **todos os 22 passos** |
| Celular 375 px | ✅ fluxos ok · ✅ alvos de toque ≥ 44 px |
| Desempenho com 201 post-its | ✅ **corrigido** — parado 60 fps, zoom 44 fps, rolagem 38 fps (era 16 / 12 / 18) |
| Acessibilidade automática | ✅ nomes, rótulos, idioma, "reduzir movimento" · ⚠️ foco fraco, sem títulos |

## 🔴🟠 Achados (do mais grave para o menos)

| # | Gravidade | Achado | Evidência | Como resolver |
|---|---|---|---|---|
| Q1 | ✅ **Corrigido** | **Mural pesado com muitos post-its.** Com 201 post-its: parado 27–31 fps, zoom 17 fps, rolagem 14 fps, 20 travadas na rolagem. | Experimento: tirar o "respirar" dos post-its sobe de 31 → **50 fps**; sem nenhuma animação, 57 fps. 246 animações CSS rodando ao mesmo tempo. | Animar só os post-its **visíveis na tela** (IntersectionObserver), pausar animações durante zoom/rolagem e desligar o "respirar" acima de ~40 post-its. |
| Q2 | ✅ **Corrigido** | **Biblioteca `nodemailer` vulnerável** (versão 6): 20+ alertas, incluindo injeção de comando SMTP e e-mail indo para domínio errado. | `npm audit` no back. Risco atual **baixo**: o e-mail de "esqueci a senha" não está ligado nem configurado. | Atualizar para a versão corrigida (`npm i nodemailer@latest`) e rodar os testes. |
| Q3 | ✅ **Corrigido** | **Faltam cabeçalhos de segurança** no front e no back: `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`. | Sondagem direta. | Adicionar `headers()` no `next.config.mjs` e um middleware no Express (ou `helmet`). Protege contra clickjacking e alguns ataques de script. |
| Q4 | ✅ **Corrigido** | **Texto grande demais dá erro 500** em vez de recusar educadamente (413). | Corpo de 3 MB → 500; log: `PayloadTooLargeError` (`entity.too.large`). | Tratar `err.type === 'entity.too.large'` no `errorHandler` → 413 "Texto grande demais". |
| Q5 | ✅ **Corrigido** | **Alvos de toque pequenos no celular** (mínimo recomendado 44×44 px). | Bolinhas de cor do post-it **20×20**, "Expandir clima" **24×24**, botões do formulário 26–33 px de altura, topo 40×40. | Área de toque invisível de 44 px em volta (como já foi feito no ⋯ do post-it). |
| Q6 | 🟡 Baixa | **Demora para mostrar 201 post-its** (~6,5 s até todos aparecerem). | API responde em **57 ms**; o tempo é montagem + animação de entrada de 201 post-its no modo de desenvolvimento. | Medir no build de produção; animar a entrada só dos visíveis; virtualizar quem está muito fora da tela. |
| Q7 | 🟡 Baixa | **Contorno de foco do teclado fraco** (pendência I10 do relatório de usuário novo). | Botão + sem contorno visível ao focar. | Contorno amarelo de 3 px em `:focus-visible` para todos os botões. |
| Q8 | 🟡 Baixa | **Mural sem títulos de seção (h1/h2)** para leitor de tela navegar. | Nenhum `h1`/`h2` na tela principal. | Um `h1` visualmente escondido ("Mural — pasta X") e `h2` nos painéis. |
| Q9 | ✅ **Corrigido** | Servidores **se anunciam** (`X-Powered-By: Express` / `Next.js`). | Sondagem. | `app.disable('x-powered-by')` e `poweredByHeader: false`. |
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

---

## ✅ Q1 corrigido — desempenho com muitos post-its (31/10/2026)

Medido no **build de produção**, 201 post-its e 59 fios, 1366×768, comparação A/B na mesma tela
(A = otimizações desligadas à força, B = como ficou):

| 201 post-its | Antes | Depois |
|---|---|---|
| Parado | 16 fps · 10 travadas | **60 fps · 0 travadas** |
| Zoom com Ctrl + roda | 12 fps · 13 travadas | **44 fps · 0 travadas** |
| Rolagem | 18 fps · 11 travadas | **38 fps** · 4 travadas |

**O que mudou** (tudo por classes no DOM, sem redesenhar os post-its):

1. **Só "respira" quem está na tela:** um único `IntersectionObserver` (com folga de 300 px) marca os de fora
   com `.offscreen`; um `MutationObserver` acompanha os post-its que chegam depois (troca de pasta, criar).
2. **Muitos visíveis** (mais de 40, zoom afastado): o mural ganha `.many-notes` e ninguém "respira".
3. **Mural em movimento** (`.is-moving`, ligado pelo motor do mural no zoom/arrastar/rolar/inércia):
   animações pausadas, mural vira camada da placa de vídeo (`will-change`), vidro fosco
   (`backdrop-filter`) trocado por fundo sólido até parar, e post-its sem eventos de mouse (menos o que
   está sendo arrastado).
4. **Fora da tela, o navegador nem desenha o conteúdo** (`content-visibility: auto` só nos `.offscreen`,
   com `contain-intrinsic-size: auto` para lembrar o tamanho real) — maior ganho na rolagem.
5. **Minimapa** atualiza no máximo ~12×/s durante o movimento (antes: a cada quadro).
6. **Pasta com mais de 40 post-its:** eles aparecem direto, sem a animação de "cair" um por um.

**Conferido depois da mudança:** 0 alturas alteradas (fios, minimapa e mapa de ideias continuam certos) ·
59 fios desenhados · menu ⋯ abre inteiro · texto fora da tela continua acessível (leitor de tela / busca) ·
nenhum erro no console. Ideias descartadas pelo próprio teste: tirar a sombra durante o movimento
(**piorou**: 38 → 12 fps) e `content-visibility: hidden` (rápido, mas esconde o texto de leitores de tela).

---

## ✅ Q2, Q3, Q4, Q5 e Q9 corrigidos — segurança e toque no celular (31/10/2026)

| # | O que mudou | Prova |
|---|---|---|
| Q2 | `nodemailer` 6 → **10.3.1** | `npm audit`: **0 vulnerabilidades**; montagem de um e-mail de teste ok; 83/83 testes |
| Q3 | **Front** (`next.config.mjs` → `headers()`): `Content-Security-Policy` (só o próprio site carrega scripts, estilos, imagens, fontes e conexões; ninguém embute o mural em `<iframe>`), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (localização só para o clima; câmera/microfone nunca) e **HSTS só em produção**. **Back** (Express): os mesmos cabeçalhos, com CSP `default-src 'none'` (a API só devolve JSON e imagens) | Sondagens: **23/24** (era 16/24). No build de produção: HSTS presente e CSP sem `unsafe-eval`/`ws:`. No navegador: **nenhum bloqueio** de CSP — post-its, foto (blob), clima, busca, calendário e configurações funcionando |
| Q4 | `errorHandler`: `entity.too.large` → **413** "Conteúdo grande demais. Diminua o texto ou a foto e tente de novo." | Teste automático novo: corpo de 3 MB → 413 |
| Q5 | No celular (`pointer: coarse` ou até 720 px): bolinhas de cor 32 px com área de toque invisível de **48 px**; "Expandir clima" com área de **44 px**; botões, campos e chips da janela do post-it com **44 px** de altura; botões do topo 44×44 | Medido em 375 px: bolinha 48×48 · clima 44×44 · Checklist/Etiqueta/Foto/Data/Cancelar/Colar 44 px · engrenagem 44×44 · sem rolagem lateral |
| Q9 | `app.disable('x-powered-by')` e `poweredByHeader: false` | Sondagem: nenhum dos dois servidores se anuncia; teste automático confere |

**Por que HSTS só em produção:** no `localhost` ele ficaria gravado no navegador e forçaria https em outros
projetos do mesmo PC. **Por que CSP sem "nonce":** o modelo com nonce obriga todas as páginas a serem geradas
na hora (sem cache); o modelo sem nonce da documentação do Next já bloqueia scripts e iframes de fora.

**Ainda abertos (baixa prioridade):** Q6 (demora para mostrar 201 post-its), Q7 (contorno de foco),
Q8 (títulos para leitor de tela), Q10 (aviso de data no mês seguinte).
