(function () {
  console.log("🔥 AI MOD ATIVADO");

  function injectAI(player, enemy) {
    player.isAI = true;

    player.ai = {
      update() {
        const dist = enemy.getX ? enemy.getX() - player.getX() : enemy.x - player.x;

        // Movimento
        if (Math.abs(dist) > 80) {
          if (dist > 0) player.pressRight?.();
          else player.pressLeft?.();
        }

        // Ataque
        if (Math.abs(dist) < 90 && Math.random() > 0.7) {
          player.pressPunch?.();
          player.pressKick?.();
        }

        // Defesa
        if (enemy.isAttacking && Math.random() > 0.6) {
          player.pressBlock?.();
        }
      }
    };
  }

  function hookGameLoop() {
    const interval = setInterval(() => {
      if (window.game && window.game.players) {
        clearInterval(interval);

        const p1 = window.game.players[0];
        const p2 = window.game.players[1];

        injectAI(p1, p2);
        injectAI(p2, p1);

        console.log("✅ IA conectada aos players");

        // Hook no update
        const originalUpdate = window.game.update;

        window.game.update = function () {
          p1.ai.update();
          p2.ai.update();

          return originalUpdate.apply(this, arguments);
        };

        // Bloquear input humano
        window.addEventListener("keydown", e => e.stopImmediatePropagation(), true);
        window.addEventListener("keyup", e => e.stopImmediatePropagation(), true);

        console.log("🚫 Input humano bloqueado");
      }
    }, 500);
  }

  hookGameLoop();
})();