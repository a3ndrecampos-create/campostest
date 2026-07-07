# PNGs de evento — Pipa Interativa

Coloque aqui um arquivo `.png` para cada ação/evento do jogo (fundo transparente
de preferência). O nome do arquivo precisa ser **exatamente** o `id` da ação,
em minúsculas:

| Arquivo esperado              | Ação                          | Ícone atual |
|--------------------------------|-------------------------------|:-----------:|
| `spawn_random.png`             | Spawnar Pipa Normal            | 🪁 |
| `spawn_large.png`              | Spawnar Pipa Grande             | 🪁 |
| `spawn_cerol.png`              | Spawnar Pipa com Cerol          | 💥 |
| `spawn_large_cerol.png`        | Spawnar Pipa Grande + Cerol     | 💥 |
| `spawn_cerol_fino.png`         | Spawnar Pipa + Cerol Fino       | 🔥 |
| `spawn_large_cerol_fino.png`   | Spawnar Pipa Grande + Cerol Fino| 🔥 |
| `spawn_chilena.png`            | Spawnar Pipa Chilena            | ⚡ |
| `spawn_large_chilena.png`      | Spawnar Pipa Grande Chilena     | ⚡ |
| `cerol.png`                    | Ativar Cerol na Pipa            | 💉 |
| `cerol_fino.png`                | Ativar Cerol Fino na Pipa       | 🟢 |
| `chilena.png`                  | Ativar Chilena na Pipa          | 🟡 |
| `cura_15.png`                  | Curar +15 HP                    | ❤️ |
| `cura_50.png`                  | Curar +50 HP                    | 💚 |
| `cura_100.png`                 | Curar 100 HP (Full)             | 💖 |

Se um arquivo não existir, o painel continua mostrando o ícone emoji no lugar
(nada quebra, só falta a arte).

> Nota: essa lista vem de `PIPA_ACTION_TYPES` em `js/data.js`. Se você criar uma
> ação nova lá, adicione a linha correspondente aqui também.
