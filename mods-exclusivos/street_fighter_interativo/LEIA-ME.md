# Versão otimizada — apenas modo Quick Match

## Como o jogo funcionava antes
O jogo original tinha um overlay de "debug" (`#pnlDebugModal`) com 4 abas:
**Main** (config. de joystick / desativar dano), **Quick Match**
(escolher lutadores/estágio e batalhar), **Projectile Editor** (editor de
hitbox de projéteis) e **Other** (Reset Game). Ao clicar em "Start Game!",
o jogo sorteava aleatoriamente uma luta de demonstração (Ryu+Ken vs Akuma
ou M.Bison) e entrava direto na partida — as telas de "Insert Coin" e
"Char Select" (modo história/arcade) existiam no código mas não eram
realmente usadas nesse fluxo.

## O que foi feito
1. **`quickmatch.htm`** (era `default.htm`)
   - Removidas as abas *Main*, *Projectile Editor* e *Other* — só resta o
     configurador de Quick Match (escolher Time 1, Time 2 e o estágio).
   - O painel de Quick Match agora é exibido diretamente (sem sistema de
     abas), já que é o único modo disponível.
   - O botão "Start Game!" agora abre o configurador de Quick Match em vez
     de sortear uma luta automática — o jogador escolhe os lutadores antes
     de a partida começar.
   - O botão que abria o "Help & Settings" foi renomeado para
     **"Trocar lutadores / Novo confronto"** — é por ele que você reabre o
     menu durante ou depois de uma partida.
   - A lista de teclas do teclado foi mantida (útil), mas a configuração de
     joystick/gamepad e o aviso "Joystick not detected" foram removidos.
   - A tag `<script src="script/insert-coin.js">` foi removida (arquivo não
     é mais usado).

2. **`script/debug-modal.js`**
   - Removidas as classes `MainEditorWindow`, `ProjectileEditorWindow` e
     `OtherWindow`, e toda a lógica de troca de abas.
   - `QuickMatchConfiguratorWindow` foi mantida **sem nenhuma alteração de
     comportamento** — é o coração do modo de jogo.
   - `DebugModal` ficou bem mais simples: `open()` só pausa o jogo e mostra
     o painel (não há mais abas para escolher).
   - Arquivo caiu de ~720 para ~245 linhas.

3. **`script/game.js`**
   - As partidas no modo Quick Match sempre correm em `MATCH_STATES.PRACTICE`
     (rodadas seguem indefinidamente — você só volta ao menu manualmente).
   - Como rede de segurança para qualquer caso em que uma partida force o
     fim (`mustQuit()` — por exemplo quando um jogador aperta "Start" para
     entrar como desafiante durante uma luta), troquei o roteamento que ia
     para `startCharSelect()` (modo história) ou `startInsertCoinScreen()`
     (modo arcade) por um único caminho: `returnToQuickMatchMenu()`, que
     libera os recursos da partida (como antes) e reabre direto o
     configurador de Quick Match.
   - `startCharSelect`, `startInsertCoinScreen`, `runCharSelectLoop` e
     `runInsertCoinScreenLoop` foram removidas (não tinham mais nenhum
     ponto de entrada).

4. **`script/init.js`**
   - `startUpGame()` agora chama `__debugModal.open()` em vez de sortear
     uma luta de demonstração.
   - `StartCharacterSelection`, `StartInsertCoin` e `ResetGame` (órfãs)
     foram removidas, assim como o pré-carregamento do áudio de
     `insert-coin.js`.

5. **`script/insert-coin.js`** foi excluído — era usado somente pela tela
   "Insert Coin" do modo arcade, que não existe mais nesta versão.

## Atualização: CPU vs CPU ao iniciar
Antes, ao clicar em **"Start Quick Match!"**, só o time 2 (e o restante do
time 1, se houvesse mais de 1 lutador) era controlado pela CPU — o primeiro
lutador do TEAM 1 ficava sempre fixo no jogador humano (teclado).

Agora isso foi ajustado em `script/debug-modal.js` (função `getTeam`):
- **"Start Quick Match!"** → todos os lutadores, dos dois times, são
  controlados pela CPU (partida 100% automática, CPU vs CPU).
- **"Practice (no AI)"** → ninguém é controlado pela CPU; os dois times
  ficam disponíveis para controle manual (Time 1 no teclado de P1, Time 2
  no teclado de P2 — já configurado em `init.js`/`InitUsers()`).

## Atualização v3: sem tela nenhuma — só CPU vs CPU
Conversamos e ficou claro que o "modo com mais personagens" era a tela
antiga de Insert Coin/Char Select — mas como expliquei, ela **não tinha
mais personagens de verdade**: o jogo só tem 5 personagens com sprites e
IA implementados (Ryu, Ken, Sagat, M.Bison, Akuma), os mesmos que já
estavam disponíveis no Quick Match. Trazer essa tela de volta não geraria
mais variedade.

Por isso, o pedido final foi simplificado: **remover o modo Quick Match
por completo** (nenhuma tela de escolha) e deixar um único botão que já
sorteia 2 personagens entre os 5 disponíveis + 1 estágio, e começa direto
uma luta 100% CPU vs CPU.

O que mudou:
- **`cpu-vs-cpu.htm`** (antes `quickmatch.htm`): todo o modal de Quick
  Match (escolha de times/estágio) foi removido do HTML. O botão de
  "Start Game!" agora chama `startUpGame()`, que já inicia a luta sorteada.
  Também adicionei um botão **"Nova luta (CPU vs CPU)"** que, a qualquer
  momento, interrompe a luta atual e começa outra com personagens/estágio
  novos — sem abrir tela nenhuma, é instantâneo.
- **`script/init.js`**: nova função `StartRandomCpuBattle()` sorteia 2
  personagens diferentes (entre Ryu, Ken, Sagat, M.Bison, Akuma) e um
  estágio, e chama `debug_.startMatch(...)` com `C:true` nos dois lados
  (CPU vs CPU). `startUpGame()` agora chama essa função direto.
- **`script/game.js`**: como as lutas agora usam `debug_.startMatch`
  (partida "de verdade", com contagem de rounds) em vez de
  `debug_.practice`, uma partida pode de fato terminar quando alguém
  vence. Por isso, `Game.prototype.startNextCpuBattle` substitui o antigo
  `returnToQuickMatchMenu`: ao fim de qualquer luta, ele libera os
  recursos e já chama `StartRandomCpuBattle()` de novo automaticamente —
  o jogo fica girando lutas aleatórias para sempre, sem intervenção.
- **`script/debug-modal.js`** foi **excluído** — não sobrou nenhum uso
  para o configurador de Quick Match.

## O que **não** foi tocado (de propósito)
- Todo o motor de luta: animação, combate, IA, física, sprites, efeitos
  (incluindo `animation-trial.js`, que apesar do nome é o efeito visual de
  "rastro" de golpes especiais — não é uma tela de debug).
- `char-select.js` foi mantido — apesar do nome, ele não é só uma "tela";
  `Game.prototype.startMatch` usa `CreateCharSelect()` internamente como
  fábrica para montar os objetos `Player` de cada time, mesmo no modo Quick
  Match. Removê-lo quebraria toda partida.
- Os controles de velocidade do jogo ([8]/[9]/[0]) e pausa quadro-a-quadro
  ([O]/[P]) — não são um "modo", são utilidades, então deixei como estavam.

## Observação importante
Recebi apenas o `default.htm` e a pasta `script/` (incluindo os áudios em
base64). As pastas `css/` e `images/` do projeto original não foram
enviadas, então não consegui abrir isto num navegador para um teste visual
completo. As mudanças são pontuais e de baixo risco (troca de roteamento de
tela + remoção de painéis HTML/JS não usados), e o JavaScript editado foi
validado sintaticamente, mas recomendo copiar estes arquivos de volta para
dentro do seu projeto completo (mantendo `css/` e `images/`) e testar a
partida do início ao fim antes de publicar.
