# Próxima sessão: onde paramos (otimização 60 fps)

> Leia isto primeiro. Ele resume o estado da otimização e evita refazer investigação já feita.
> Última atualização: 22/11/2026 (5ª rodada).

## Meta

Mural fluido (perto de 60 fps) também em PC fraco e celular simples (tipo Galaxy J2), **sem perder o
visual** em quem tem aparelho bom. Aparelho fraco recebe o **modo leve** (`lib/performance.js`), que liga
sozinho (memória ≤ 4 GB, economia de dados, ou tela parada abaixo de 40 fps) ou em Configurações → Desempenho.

## Estado do git

- **Tudo enviado ao GitHub** em 22/11/2026 (até a 5ª rodada), a pedido do Gustavo.
- Fora do git (não commitar): `graphify-out/` (mapa do graphify) e `Lixeira - Atalho.lnk`.

## 5ª rodada (22/11/2026, noite) — menos pedaços de desenho por post-it

| Mudança | Arquivo(s) | Ganho medido |
|---|---|---|
| Fita desenhada já inclinada numa imagem vetorial (sem `transform`); comparada em foto ampliada 3×: igual à antiga | `globals.css` | Cada post-it vira menos pedaços de desenho: Layerize na rolagem com 200 (PC 4×) 1.634 → **1.012 ms** |
| Corte do texto (`overflow: hidden`) só em texto longo (`.long`: > 100 caracteres ou > 5 linhas); texto curto nunca chega ao limite | `PostIt.js`, `globals.css` | Idem |
| Alça de redimensionar com `visibility: hidden` quando não aparece (no toque, como antes) | `globals.css` | Idem |
| Arrastar com 200 post-its (PC 4×): 32–35 → **50–51** | | |

## 4ª rodada (22/11/2026, noite) — estresse com 200 post-its

| Mudança | Arquivo(s) | Ganho medido |
|---|---|---|
| Regras de `.is-moving` sem seletor terminando em `*` (`.topbar > *`, `.weather-icon *` → classes explícitas) | `infinite.css` | Com `*` o Chrome recalculava a página inteira (6.187 elementos) no começo/fim de cada rolagem/zoom. Rolar com 200 post-its (PC 4×): 11–19 → **45–51** (trace: estilo 2.178 → 111 ms) |
| Removido `pointer-events: none` nos post-its durante o movimento (propriedade herdada = recalcula todos os filhos) | `infinite.css` | Idem |
| Post-it lê o zoom na hora (`getZoom`) em vez de receber `zoom` como propriedade | `PostIt.js`, `page.js` | Num aparelho lento o zoom "gravava" no meio do gesto e refazia os 201 post-its; zoom com 200 (PC 4×): 9–14 → **21–30** |

## 3ª rodada (22/11/2026, noite)

| Mudança | Arquivo(s) | Ganho medido |
|---|---|---|
| Estado da janela do post-it fora da página (`createStore`/`useStore` em `lib/store.js`; `NoteModalHost` em `page.js`). Abrir/fechar redesenha só a janela | `lib/store.js`, `page.js` | Abrir janela no celular 6× lento: 16–28 → **52–58**; PC 4× com 200 post-its: 4–10 → **45–48** |
| Trocas de `.offscreen`/`.many-notes` adiadas enquanto o mural se mexe (`pending` + `MutationObserver` na classe `is-moving`) | `page.js` | Zoom no PC 4×, 40 post-its: 21–28 → **33–51** (1 travada) |
| Retângulo do mural lido 1× por gesto de zoom (`room.current.rect`) | `lib/useInfiniteBoard.js` | Menos layout forçado no meio do zoom |
| Minimapa no modo leve atualiza só quando o movimento para (220 ms) | `BoardOverlays.js` | Menos trabalho durante zoom/rolagem em aparelho fraco |
| graphify concluído: `graphify-out/` (fora do git) com `graph.html`, `GRAPH_REPORT.md`, `graph.json`. Achado: `BoardPage()` é o nó mais conectado (84 ligações, coesão 0,06) — dividir a página é o caminho para o desempenho | — | Consultar com `graphify query "..."` (Python 3.12 já tem o graphify) |

## O que foi feito na 2ª rodada (22/11/2026)

| Mudança | Arquivo(s) | Por quê / ganho medido |
|---|---|---|
| Botões ✎ 📌 ⋯ e a bolinha do fio com `visibility: hidden` quando não aparecem (voltam no hover, foco de teclado `:focus-visible`/`:has(:focus-visible)`, menu aberto e sempre no toque) | `infinite.css` | Com opacidade 0 eram desenhados nos 200 post-its: rolar 41→57, zoom 35→48 fps (PC) |
| Post-it focável: `tabIndex=0`, `role="group"`, `aria-labelledby` no título, **Enter abre a edição** | `PostIt.js` | Sem os botões invisíveis o teclado precisava de outro caminho; TAB agora para 1× por post-it (antes 3) |
| Zoom afastado (< 50%, `FAR_ZOOM`): classe `far` no mural esconde texto/checklist/etiquetas/foto (mantém cor e título; tamanho não muda) | `page.js`, `infinite.css` | Texto ilegível custava desenhar letra por letra; rolar longe 37–42→46–50 |
| Céu estrelado anda por `transform` (camada maior que a tela, desloca 1×2 ladrilhos) | `globals.css` | Antes animava `background-position` e redesenhava a tela inteira |
| Pulso do botão + só com mural vazio (`.fab.invite`) | `page.js`, `globals.css` | Pulso eterno de `box-shadow` redesenhava a cada quadro (e distrai — IHC) |
| Ícone do clima flutua por CSS (não mais framer em JS); pausa durante movimento; parado no modo leve | `WeatherWidget.js`, `infinite.css` | Só isso ocupava >50% do processador parado num PC fraco; agora respeita "reduzir movimento" |
| Ícones da previsão (5 dias) sem animação; segundos do relógio sem "virada" no modo leve (`plain`) | `infinite.css`, `Clock.js`, `WeatherWidget.js`, `page.js` | Animações em SVG/JS forçavam a página a se refazer todo quadro |
| **Bug corrigido:** regra do modo leve/movimento que tirava o vidro fosco não funcionava no build | `infinite.css` | O compactador de CSS descartava `backdrop-filter:none` quando havia a linha `-webkit-` junto; ficou só a forma padrão |
| Arraste por `translate` direto no elemento (camada própria `will-change` no `.is-dragging`); left/top só gravados ao soltar (zerado no mesmo quadro via `useLayoutEffect`, sem pulo) | `PostIt.js`, `infinite.css` | Antes refazia o post-it no React a cada movimento |
| **Removido `content-visibility`** dos post-its fora da tela | `infinite.css` | Causava **explosão de camadas** (174 camadas de GPU com 200 post-its → 16 sem ele); zoom 37→44 |
| `MotionConfig reducedMotion`: `'always'` no modo leve (sem molas/escala, mantém esmaecer), `'user'` fora | `page.js` | Abrir janela/criar post-it leve no celular; respeita "reduzir movimento" do sistema |
| Fios, tachinhas, zonas e minimapa memorizados (`memo`) + funções estáveis (`overlayFns`) | `BoardOverlays.js`, `page.js` | Abrir uma janela refazia tudo isso (200 post-its, PC fraco: janela 4→10 fps) |
| (sessão anterior, sem commit até agora) Checklist/Etiqueta/Data levam o cursor ao campo novo; clima tenta de novo a cada 30 s se falhar | `NoteModal.js`, `useWeather.js` | Bugs achados testando como usuário |

## Números (build de produção, Chrome invisível, 200 post-its salvo indicação)

| Cenário (após a 5ª rodada) | Parado | Arrastar | Rolar | Zoom | Abrir janela |
|---|---|---|---|---|---|
| PC normal, completo | 60 | 57–58 | 48–58 | 29–47 | 53–55 |
| PC 4× mais lento, leve, **40 post-its** | 61 | **42–59** | **56–59** | **36–60** | **54–58** |
| PC 4× mais lento, leve, 200 post-its | 61 | **50–51** | 21–50 | 13–35 | 44–57 |
| Celular 6× mais lento (≈ J2), leve, 40 post-its | 60 | — | 60 | — | 47–58 |

(Faixas largas = oscilação da máquina com Discord/Steam abertos; comparar sempre alternando `base,X,base,X`.)

Antes desta rodada (PC 4× leve, 200): parado 13–19, arrastar 6–8, rolar 4–6, zoom 4–5. Rodar o medidor com
**jogos e Steam fechados** (Forza/Steam derrubavam e oscilavam os números).

## Próximos passos (em ordem de valor)

1. ~~Abrir a janela no celular fraco~~ e ~~zoom com 40 post-its~~: feitos na 3ª rodada.
2. **Zoom com 200 post-its em aparelho fraco** (13–35): no trace do zoom o maior custo agora é **Paint**
   (~1,3 s a cada 3 s no PC 4×) e ainda há Layerize (~0,6 s). Ideias: o post-it ainda tem transformação própria
   (inclinação do framer-motion, `rotate`) — testar a inclinação dentro do próprio desenho; ver se o zoom
   provoca repintura (no gesto só a escala deveria mudar). NÃO voltar com `content-visibility` (explode
   camadas) nem `visibility: hidden` fora da tela (tira o texto do leitor de tela). Também dá para tirar mais
   estado do `BoardPage` (graphify: 84 ligações) para stores como `lib/store.js`.
3. Modo completo ainda tem ~71 camadas (post-its "respirando" com `translate`); só importa em aparelho bom.
4. Next.js **16.4.3 → 16.4.6**: o próprio `next build` avisa de falha de segurança conhecida (às vezes para o
   build — rodar de novo passa). Atualizar com aprovação do Gustavo (`npm i next@16.4.6` no `frontend`).
5. Enviar ao GitHub sempre com aprovação do Gustavo.

## Como retomar rápido

```bash
# back (porta 4000)
cd backend && npm run dev
# build de produção do front (porta 3100) — se aparecer "SecurityFatalError", só rodar o build de novo
cd frontend && npx next build && npx next start -H 127.0.0.1 -p 3100
# medir (cria sozinho uma conta de teste local com 201 ou 40 post-its, guardada na pasta temporária)
node frontend/scripts/medidor-fps.mjs http://127.0.0.1:3100 1 base
MODO=lite QTD=40 node frontend/scripts/medidor-fps.mjs http://127.0.0.1:3100 4 base
MODO=lite QTD=40 CENAS=parado,rolar_real,janela node frontend/scripts/medidor-fps.mjs http://127.0.0.1:3100 6 base --celular
```

Cenários do medidor (`CENAS=`): `parado`, `mouse`, `arrastar_real`, `rolar_real` (gesto real, como dedo/roda),
`rolar` (por JS), `rolar_longe`, `zoom`, `janela`, `perfil` (ms de processador por segundo parado),
`animacoes` (lista o que está animando), `nlayers` (nº de camadas de GPU), `funcional` (teste funcional:
arrastar/soltar e salvar, hover, TAB/Enter, zoom longe, relógio, erros no console), `t_<cenário>` (trace do
Chrome com o top de custos: Layerize, estilo, script...). Variações (lista de `VARIANTS` no script) injetam CSS
para testar hipóteses, ex.: `base,sem_cv,base,sem_cv`.

## Lições que custaram caro (não repetir)

- **Medir no painel do navegador do app não serve** quando a janela do Claude não está à vista (cai a 1–2 fps).
  Usar o medidor (Chrome invisível).
- `:is()` com pseudo-elemento (`::before`) **invalida a regra inteira**: separar em seletores próprios.
- Não escrever `backdrop-filter` junto com `-webkit-backdrop-filter` na mesma regra (o build descarta um).
- `content-visibility: auto` em muitos elementos → explosão de camadas no Chrome.
- Cookie de login vale para o host inteiro (127.0.0.1:3000 e :3100 dividem sessão).
- Medições com CPU 4×/6× oscilam: repetir e comparar alternando (`base,X,base,X`).
