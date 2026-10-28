# ✅ Relatório de testes — Mural de Notas

Data: 27/10/2026 · Ambiente: Windows 11, Node 24, Next.js 16, HTTPS local (`npm run dev:https`)

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
