# Mod Exclusivo — Pipa Interativa

Esta pasta guarda uma **cópia de referência** do jogo "Pipa Interativa"
(jogo_id no Supabase: `pipa_interativa`).

O jogo em produção roda hospedado externamente (GitHub Pages):
https://a3ndrecampos-create.github.io/fedddddddddddserrrrrrs/

O painel abre essa URL (ou a que estiver cadastrada em `servidor_url` na
tabela `configuracoes_jogos` do Supabase) numa nova janela e controla o jogo
mandando mensagens via `postMessage`:

```js
window.postMessage({ type: "PIPA_ACTION", action: "SPAWN_RANDOM", user: "...", avatar: "..." }, "*");
```

O `index.html` guardado aqui já tem esse listener pronto (procure por
`INTEGRAÇÃO COM O PAINEL StreamToEarn` no final do arquivo). Se o jogo
publicado no GitHub Pages for atualizado, use este arquivo como referência
para reaplicar o mesmo trecho de integração na nova versão.

## Ações disponíveis (`PIPA_ACTION_TYPES` em `js/data.js`)
SPAWN_RANDOM, SPAWN_LARGE, SPAWN_CEROL, SPAWN_LARGE_CEROL, SPAWN_CEROL_FINO,
SPAWN_LARGE_CEROL_FINO, SPAWN_CHILENA, SPAWN_LARGE_CHILENA, CEROL, CEROL_FINO,
CHILENA, CURA_15, CURA_50, CURA_100.

## Ícones de evento
Coloque os PNGs de cada ação em:
`assets/games-exclusive/pipa_interativa/eventos/`
(veja o README dentro dessa pasta para os nomes exatos de arquivo).
