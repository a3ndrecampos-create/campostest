/*******************************************************************************************************************************
 * PAINEL DE CONTROLE — CPU VS CPU (King of the Hill + TikFinity)
 * ---------------------------------------------------------------------------------------------------------------------------
 * Arquivo único que injeta toda a lógica extra no jogo sem modificar nenhum arquivo original do motor:
 *  - Sistema de fila de seguidores (modo Rei da Colina)
 *  - Avatar do seguidor flutuando acima do personagem e seguindo ele
 *  - Indicador de vitórias (rounds ganhos) acima do lutador
 *  - Faixa de espera embaixo da tela do jogo
 *  - Ações de golpe/poder disparadas por evento do TikFinity (com trava: só quem está lutando pode acionar)
 *  - Dificuldade ajustada (dano reduzido pra luta durar mais)
 *  - Mensagem "INSERT COIN" / "PRESS 1P" escondida
 *  - Comunicação com painel-live.html via BroadcastChannel
 ******************************************************************************************************************************/
(function () {
    "use strict";

    /* ============================================================
     * CONSTANTES DE PERSONAGEM
     * ============================================================ */
    var CHAR_INFO = [
        {id: CHARACTERS.RYU,    key: "ryu",    label: "Ryu"},
        {id: CHARACTERS.KEN,    key: "ken",    label: "Ken"},
        {id: CHARACTERS.SAGAT,  key: "sagat",  label: "Sagat"},
        {id: CHARACTERS.MBISON, key: "mbison", label: "M. Bison"},
        {id: CHARACTERS.AKUMA,  key: "akuma",  label: "Akuma"}
    ];

    var STAGE_INFO = [
        {key: "guy",             label: "Beco (Guy)"},
        {key: "ken",             label: "Aeroporto (Ken)"},
        {key: "ryu",             label: "Templo (Ryu)"},
        {key: "sodom",           label: "Clube (Sodom)"},
        {key: "akuma",           label: "Caverna (Akuma)"},
        {key: "sagat",           label: "Deserto (Sagat)"},
        {key: "chunli",          label: "China (Chun-Li)"},
        {key: "dramatic_battle", label: "Batalha Final"}
    ];

    /* ============================================================
     * GOLPES — mapeados dos arquivos *-ai.js do motor
     * ============================================================ */
    var BASIC_MOVES = {
        SOCO_FRACO:  {label: "Soco fraco",  input: [{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        SOCO_MEDIO:  {label: "Soco médio",  input: [{IsDown:true,Button:BUTTONS.MEDIUM_PUNCH}]},
        SOCO_FORTE:  {label: "Soco forte",  input: [{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        CHUTE_FRACO: {label: "Chute fraco", input: [{IsDown:true,Button:BUTTONS.LIGHT_KICK}]},
        CHUTE_MEDIO: {label: "Chute médio", input: [{IsDown:true,Button:BUTTONS.MEDIUM_KICK}]},
        CHUTE_FORTE: {label: "Chute forte", input: [{IsDown:true,Button:BUTTONS.HARD_KICK}]},
        PULAR:       {label: "Pular",       input: [{IsDown:true,Button:BUTTONS.JUMP}]},
        BLOQUEAR:    {label: "Bloquear",    input: [{IsDown:true,Button:BUTTONS.BACK}]}
    };

    var RYU_KEN_SPECIALS = {
        HADOUKEN_FRACO:       {label:"Hadouken fraco",      input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        HADOUKEN_MEDIO:       {label:"Hadouken médio",      input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.MEDIUM_PUNCH}]},
        HADOUKEN_FORTE:       {label:"Hadouken forte",      input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        TATSUMAKI_FRACO:      {label:"Tatsumaki fraco",     input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.BACK},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.LIGHT_KICK}]},
        TATSUMAKI_MEDIO:      {label:"Tatsumaki médio",     input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.BACK},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.MEDIUM_KICK}]},
        TATSUMAKI_FORTE:      {label:"Tatsumaki forte",     input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.BACK},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_KICK}]},
        SHORYUKEN_FRACO:      {label:"Shoryuken fraco",     input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        SHORYUKEN_MEDIO:      {label:"Shoryuken médio",     input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.MEDIUM_PUNCH}]},
        SHORYUKEN_FORTE:      {label:"Shoryuken forte",     input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        SUPER_HADOUKEN:       {label:"★ Super Hadouken",    input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_PUNCH}], super:true}
    };

    var SAGAT_SPECIALS = {
        TIGER_SHOT_FRACO:     {label:"Tiger Shot fraco",    input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        TIGER_SHOT_FORTE:     {label:"Tiger Shot forte",    input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        TIGER_UPPERCUT_FRACO: {label:"Tiger Uppercut fraco",input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        TIGER_UPPERCUT_FORTE: {label:"Tiger Uppercut forte",input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        TIGER_KNEE_FRACO:     {label:"Tiger Knee fraco",    input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.LIGHT_KICK}]},
        TIGER_KNEE_FORTE:     {label:"Tiger Knee forte",    input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.HARD_KICK}]},
        SUPER_TIGER_SHOT:     {label:"★ Super Tiger Shot",  input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_PUNCH}], super:true}
    };

    var MBISON_SPECIALS = {
        TELEPORTE_LONGE:  {label:"Teleporte longe",  input:[{IsDown:true,Button:BUTTONS.BACK},{IsDown:false,Button:BUTTONS.BACK},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.BACK},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        TELEPORTE_MEIO:   {label:"Teleporte meio",   input:[{IsDown:true,Button:BUTTONS.BACK},{IsDown:false,Button:BUTTONS.BACK},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.BACK},{IsDown:true,Button:BUTTONS.LIGHT_KICK}]},
        TELEPORTE_FRENTE: {label:"Teleporte frente", input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        TELEPORTE_ATRAS:  {label:"Teleporte atrás",  input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.LIGHT_KICK}]}
    };

    var AKUMA_SPECIALS = {
        GOHADOUKEN_FRACO:   {label:"Gohadouken fraco",   input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.LIGHT_PUNCH}]},
        GOHADOUKEN_FORTE:   {label:"Gohadouken forte",   input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        FIREBALL_VERMELHA:  {label:"Bola de fogo vermelha", input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.MEDIUM_KICK}]},
        DEMON_FLIP:         {label:"Demon Flip",         input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.JUMP},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        UPPERCUT_FORTE:     {label:"Uppercut forte",     input:[{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.HARD_PUNCH}]},
        SUPER_UPPERCUT:     {label:"★ Super Uppercut",   input:[{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:false,Button:BUTTONS.FORWARD},{IsDown:true,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.FORWARD},{IsDown:false,Button:BUTTONS.CROUCH},{IsDown:true,Button:BUTTONS.HARD_PUNCH}], super:true}
    };

    function buildMoveSet(specials) {
        var set = {};
        Object.keys(BASIC_MOVES).forEach(function(k){ set[k] = BASIC_MOVES[k]; });
        Object.keys(specials).forEach(function(k){ set[k] = specials[k]; });
        return set;
    }

    var MOVES_BY_CHARACTER = {};
    MOVES_BY_CHARACTER[CHARACTERS.RYU]    = buildMoveSet(RYU_KEN_SPECIALS);
    MOVES_BY_CHARACTER[CHARACTERS.KEN]    = buildMoveSet(RYU_KEN_SPECIALS);
    MOVES_BY_CHARACTER[CHARACTERS.SAGAT]  = buildMoveSet(SAGAT_SPECIALS);
    MOVES_BY_CHARACTER[CHARACTERS.MBISON] = buildMoveSet(MBISON_SPECIALS);
    MOVES_BY_CHARACTER[CHARACTERS.AKUMA]  = buildMoveSet(AKUMA_SPECIALS);

    /* ============================================================
     * ESTADO GLOBAL
     * ============================================================ */
    var QUEUE_KEY = "cpu_vs_cpu_queue";
    //cada fighter: { id, character, user, avatar, wins }
    var queue_ = loadQueue();
    var currentFighters_ = {team1: null, team2: null};
    var lastKnownDefeatedTeam_ = -1;
    var pendingChallenger_ = null;  // teamNum que precisa ser substituído (sem desafiante na fila)
    // guarda a última chave de golpe especial/super sorteada no COMBO_ESPECIAL de
    // cada time, pra não deixar o mesmo golpe sair duas vezes seguidas pro mesmo jogador
    var lastComboMove_ = {1: null, 2: null};
    var PANEL_CHANNEL = "cpu_vs_cpu_panel";
    var panelChannel_ = null;

    // arena fixa escolhida no painel — enquanto definida, toda luta nova (fim de
    // round, fila, "Nova luta") usa essa arena em vez de sortear uma aleatória.
    // "" / null = volta ao comportamento aleatório de sempre.
    var ARENA_KEY = "cpu_vs_cpu_arena";
    var forcedStageKey_ = (function() {
        try { return window.localStorage.getItem(ARENA_KEY) || ""; } catch(e) { return ""; }
    })();
    function saveForcedStage() {
        try { window.localStorage.setItem(ARENA_KEY, forcedStageKey_ || ""); } catch(e){}
    }

    /* ============================================================
     * HELPERS DE ACESSO AO MOTOR
     * ============================================================ */
    function getMatchSafe() {
        return (typeof game_ !== "undefined" && !!game_.getMatch) ? game_.getMatch() : null;
    }

    function hasActiveMatch() {
        var m = getMatchSafe();
        if (!m) return false;
        var pA = m.getTeamA() ? m.getTeamA().getPlayer(0) : null;
        var pB = m.getTeamB() ? m.getTeamB().getPlayer(0) : null;
        return !!pA && !!pB;
    }

    function getTeamObj(teamNum) {
        var m = getMatchSafe();
        if (!m) return null;
        return teamNum === 1 ? m.getTeamA() : m.getTeamB();
    }

    function getRand(n) { return Math.floor(Math.random() * n); }

    function normalizeUser(u) { return String(u || "").trim().toLowerCase(); }

    //trava de identidade: retorna 1, 2 ou null
    function findTeamForUser(user) {
        if (!hasActiveMatch() || !user) return null;
        var n = normalizeUser(user);
        if (currentFighters_.team1 && normalizeUser(currentFighters_.team1.user) === n) return 1;
        if (currentFighters_.team2 && normalizeUser(currentFighters_.team2.user) === n) return 2;
        return null;
    }

    function getCharIdForTeam(teamNum) {
        var f = teamNum === 1 ? currentFighters_.team1 : currentFighters_.team2;
        if (f && f.character !== undefined) return f.character;
        var t = getTeamObj(teamNum);
        var p = t ? t.getPlayer(0) : null;
        if (!p) return null;
        var found = CHAR_INFO.filter(function(c){ return c.key === p.getName(); })[0];
        return found ? found.id : null;
    }

    function showToast(msg) {
        var el = document.getElementById("pnlPainelToast");
        if (!el) return;
        el.textContent = msg;
        el.classList.add("show");
        clearTimeout(showToast._t);
        showToast._t = setTimeout(function(){ el.classList.remove("show"); }, 2000);
    }

    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, function(c){
            return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];
        });
    }

    /* ============================================================
     * TRAVAS DE AUTONOMIA DA IA
     * ------------------------------------------------------------
     * As IAs de cada personagem (ryu-ai.js, ken-ai.js etc.) continuam
     * lutando sozinhas com socos/chutes/bloqueio/movimentação — isso
     * NÃO é tocado. Mas dois comportamentos nativos do motor são
     * bloqueados aqui, de fora, sem editar os arquivos de IA:
     *
     *  1) Ganho automático de energia (ao acertar/apanhar golpe) —
     *     a barra de energia só pode ENCHER através de uma ação do
     *     painel de eventos (RECARREGA_ESPECIAL_10/30/50/100).
     *  2) Golpes especiais e super golpes decididos pela própria IA —
     *     só podem sair através do painel (PODERES_ALEATORIO,
     *     COMBO_ESPECIAL). Golpes básicos (soco/chute/direção/bloqueio)
     *     continuam liberados pra IA lutar normalmente.
     *
     * Isso é feito interceptando dois pontos únicos do motor:
     * Player.prototype.changeEnergy (todo ganho de energia em combate
     * passa por aqui) e Player.prototype.sendInput (todo input,
     * inclusive o da IA, passa por aqui). Um "input de movimento"
     * (golpe especial/super) é identificado por conter o MESMO botão
     * aparecendo como pressionado E solto no mesmo array — é assim que
     * o motor representa uma sequência tipo "quart-círculo" ou "dragon
     * punch". Inputs básicos (um botão só, ou botões simultâneos sem
     * soltar nada) nunca têm esse padrão, então não são afetados.
     * ============================================================ */
    var panelAuthorizedInput_ = false;

    function isMotionInput(input) {
        if (!input || input.length < 2) return false;
        var seenDown = {}, seenUp = {};
        for (var i = 0; i < input.length; i++) {
            var item = input[i];
            if (!item) continue;
            if (item.IsDown) seenDown[item.Button] = true;
            else seenUp[item.Button] = true;
            if (seenDown[item.Button] && seenUp[item.Button]) return true;
        }
        return false;
    }

    /* ============================================================
     * TELA DE APRESENTAÇÃO (FACEOFF) — desativada
     * ------------------------------------------------------------
     * O motor original mostra, no round 1 de toda partida nova, uma
     * tela com os retratos dos dois lutadores girando/crescendo até
     * se cruzarem no centro (com "VS" e som próprio) antes da luta
     * começar de verdade. Como aqui as lutas se sucedem sem parar
     * (fim de uma já dispara a próxima via StartRandomCpuBattle /
     * fila), essa tela aparecia toda vez, entre uma luta e outra.
     *
     * `Faceoff` e `Match` são construídos dentro de closures locais
     * (script/faceoff.js e script/match.js) e não ficam expostos
     * globalmente, então não dá pra sobrescrever os métodos deles
     * daqui de fora. Em vez disso, adiamos pra sempre o gatilho que
     * chama Faceoff.show(): fixando CONSTANTS.SHOW_FACEOFF_DELAY em
     * Infinity, a condição "frame > SHOW_FACEOFF_DELAY" nunca é
     * verdadeira, então a tela (e o som dela) nunca chegam a aparecer.
     * Os times continuam ficando visíveis normalmente no tempo de
     * sempre (CONSTANTS.SHOW_TEAMS_DELAY) e o anúncio de "Round 1 /
     * Fight!" continua intacto — só a tela de retratos é removida.
     * ============================================================ */
    if (typeof CONSTANTS !== "undefined") {
        CONSTANTS.SHOW_FACEOFF_DELAY = Infinity;
    }

    (function lockPlayerAutonomy() {
        if (typeof Player === "undefined" || !Player.prototype) return;

        var originalChangeEnergy_ = Player.prototype.changeEnergy;
        Player.prototype.changeEnergy = function(amount) {
            //bloqueia só o GANHO (amount > 0) natural de combate — perda
            //(gasto ao executar super, dano etc.) continua liberada.
            if (!panelAuthorizedInput_ && amount > 0) return;
            return originalChangeEnergy_.call(this, amount);
        };

        var originalSendInput_ = Player.prototype.sendInput;
        Player.prototype.sendInput = function(input) {
            if (!panelAuthorizedInput_ && isMotionInput(input)) return;
            return originalSendInput_.call(this, input);
        };
    })();

    /* ============================================================
     * AÇÕES DE JOGO — operam sobre teamNum resolvido
     * ============================================================ */

    //aumenta a vida máxima efetiva reduzindo o multiplicador de dano (luta mais longa)
    var DAMAGE_MULTIPLIER = 0.45; // ~55% menos dano → luta dura ~2x mais

    function applyDifficultyTweak() {
        [1, 2].forEach(function(teamNum) {
            var t = getTeamObj(teamNum);
            if (t && t.getHealthbar) t.getHealthbar().setDamageMultiplier(DAMAGE_MULTIPLIER);
        });
    }

    //restaura uma porcentagem FIXA (não aleatória) da vida MÁXIMA do lutador,
    //sempre disparada pelo seguidor que mandou o comando/presente — nunca sozinha.
    //percent: 10, 30, 50 ou 100
    function restoreHealthPercent(teamNum, percent) {
        var m = getMatchSafe(); if (!m) return;
        var t = getTeamObj(teamNum); if (!t) return;
        var team = teamNum === 1 ? CONSTANTS.TEAM1 : CONSTANTS.TEAM2;
        var bar = t.getHealthbar();
        var missing = bar.getMax() - bar.getAmount();
        if (missing <= 0) return;
        var amount = Math.min(missing, Math.round(bar.getMax() * (percent / 100)));
        if (amount > 0) m.changeHealth(team, -amount);
        //reaplica o multiplicador de dano após cura (ele reseta depois de certos eventos)
        bar.setDamageMultiplier(DAMAGE_MULTIPLIER);
    }

    //dá uma porcentagem FIXA (não aleatória) da barra de especial MÁXIMA,
    //sempre disparada pelo seguidor que mandou o comando/presente — nunca sozinha.
    //percent: 10, 30, 50 ou 100
    function givePowerPercent(teamNum, percent) {
        var m = getMatchSafe(); if (!m) return;
        var team = teamNum === 1 ? CONSTANTS.TEAM1 : CONSTANTS.TEAM2;
        var t = getTeamObj(teamNum); if (!t) return;
        var bar = t.getEnergybar();
        var missing = ENERGYBAR.MAX_LEVEL2 - bar.getAmount();
        if (missing <= 0) return;
        var amount = Math.min(missing, Math.round(ENERGYBAR.MAX_LEVEL2 * (percent / 100)));
        if (amount > 0) withPanelAuthorization(function () { m.changeEnergy(team, amount); });
    }

    function giveFullPower(teamNum) {
        var m = getMatchSafe(); if (!m) return;
        var team = teamNum === 1 ? CONSTANTS.TEAM1 : CONSTANTS.TEAM2;
        var t = getTeamObj(teamNum); if (!t) return;
        var bar = t.getEnergybar();
        var missing = ENERGYBAR.MAX_LEVEL2 - bar.getAmount();
        if (missing > 0) withPanelAuthorization(function () { m.changeEnergy(team, missing); });
    }

    //executa fn com a trava de autonomia liberada — usado por toda ação
    //que vem do painel de eventos (energia e golpes especiais/super)
    function withPanelAuthorization(fn) {
        var prev = panelAuthorizedInput_;
        panelAuthorizedInput_ = true;
        try { fn(); } finally { panelAuthorizedInput_ = prev; }
    }

    var AI_PAUSE_MS = 500;

    function executeMove(teamNum, moveKey) {
        var m = getMatchSafe(); if (!m) return false;
        if (!m.getAllowInput()) return false;
        var t = getTeamObj(teamNum); if (!t) return false;
        var player = t.getPlayer(0); if (!player || !player.sendInput) return false;
        var charId = getCharIdForTeam(teamNum);
        var moveSet = MOVES_BY_CHARACTER[charId] || MOVES_BY_CHARACTER[CHARACTERS.RYU];
        var move = moveSet[moveKey]; if (!move) return false;

        if (move.super) giveFullPower(teamNum);

        //pausa a IA brevemente pra o input do seguidor não ser sobrescrito imediatamente
        if (!player.__pnlAiPaused && player.Ai && typeof player.Ai.frameMove === "function") {
            var origFn = player.Ai.frameMove;
            player.__pnlAiPaused = true;
            player.Ai.frameMove = function(){};
            setTimeout(function(){
                player.Ai.frameMove = origFn;
                player.__pnlAiPaused = false;
            }, AI_PAUSE_MS);
        }
        withPanelAuthorization(function () { player.sendInput(move.input); });
        return true;
    }

    function executeMoveRandom(teamNum, level) {
        // level: "basic" = socos/chutes apenas, "special" = tudo, "combo" = especial+super garantido
        var charId = getCharIdForTeam(teamNum);
        var moveSet = MOVES_BY_CHARACTER[charId] || MOVES_BY_CHARACTER[CHARACTERS.RYU];
        var keys;
        if (level === "basic") {
            keys = Object.keys(BASIC_MOVES).filter(function(k){ return k !== "BLOQUEAR" && k !== "PULAR"; });
        } else if (level === "combo") {
            keys = Object.keys(moveSet).filter(function(k){ return moveSet[k].super; });
            if (keys.length === 0) keys = Object.keys(moveSet);
            // não repete o mesmo especial/super que saiu da última vez pra este
            // jogador — só se sobrar mais de uma opção depois de tirar o anterior
            var lastKey = lastComboMove_[teamNum];
            if (lastKey && keys.length > 1) {
                var withoutLast = keys.filter(function(k){ return k !== lastKey; });
                if (withoutLast.length > 0) keys = withoutLast;
            }
        } else {
            keys = Object.keys(moveSet);
        }
        var key = keys[getRand(keys.length)];
        if (level === "combo") lastComboMove_[teamNum] = key;
        executeMove(teamNum, key);
    }

    function spawnFighters(char1, char2, stageKey) {
        if (typeof debug_ === "undefined") return;
        hideCover();
        var stage = stageKey || forcedStageKey_ || STAGE_INFO[getRand(STAGE_INFO.length)].key;
        debug_.startMatch([{A:char1,C:true}],[{A:char2,C:true}], stage);
        showToast("Nova luta iniciada!");
        //aplica dificuldade ajustada após um curto delay (precisa dos times carregados)
        setTimeout(applyDifficultyTweak, 3000);
        //reseta a memória de "último especial/super" — luta nova, personagens novos
        lastComboMove_[1] = null; lastComboMove_[2] = null;
    }

    function spawnRandom() {
        var i = getRand(CHAR_INFO.length);
        var j = i; while(j === i) j = getRand(CHAR_INFO.length);
        spawnFighters(CHAR_INFO[i].id, CHAR_INFO[j].id, null);
    }

    /* ============================================================
     * SISTEMA DE FILA — modo Rei da Colina
     * ============================================================ */
    function loadQueue() {
        try { var r = window.localStorage.getItem(QUEUE_KEY); return r ? JSON.parse(r) : []; }
        catch(e){ return []; }
    }
    function saveQueue() {
        try { window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue_)); } catch(e){}
    }

    function addToQueue(character, user, avatar) {
        var entry = {
            id: "q"+Date.now()+"_"+getRand(99999),
            character: (character !== undefined && character !== null) ? character : CHAR_INFO[getRand(CHAR_INFO.length)].id,
            user: user || "Seguidor",
            avatar: avatar || "",
            wins: 0
        };
        queue_.push(entry);
        saveQueue();
        sendQueueState();
        renderQueueStrip();
        tryAdvanceQueue();
        return entry;
    }

    function startFreshFromQueue() {
        var f1 = queue_.shift(), f2 = queue_.shift();
        saveQueue();
        currentFighters_.team1 = f1;
        currentFighters_.team2 = f2;
        pendingChallenger_ = null;
        lastKnownDefeatedTeam_ = -1;
        spawnFighters(f1.character, f2.character, null);
        scheduleApplyAvatars();
        sendQueueState(); renderQueueStrip();
    }

    function replaceLoser(losingTeamNum) {
        var winTeamNum = losingTeamNum === 1 ? 2 : 1;
        var winner = losingTeamNum === 1 ? currentFighters_.team2 : currentFighters_.team1;
        if (winner) {
            winner.wins = (winner.wins || 0) + 1;
            updateRanking(winner.user, winner.avatar);
        }

        var challenger = queue_.shift();
        saveQueue();

        var c1 = winTeamNum === 1 ? winner.character : challenger.character;
        var c2 = winTeamNum === 2 ? winner.character : challenger.character;
        currentFighters_.team1 = winTeamNum === 1 ? winner : challenger;
        currentFighters_.team2 = winTeamNum === 2 ? winner : challenger;
        pendingChallenger_ = null;
        lastKnownDefeatedTeam_ = -1;

        spawnFighters(c1, c2, null);
        scheduleApplyAvatars();
        sendQueueState(); renderQueueStrip();
    }

    /* ============================================================
     * RANKING TOP 3 — persistido em localStorage, aparece acima do palco
     * ============================================================ */
    var RANKING_KEY = "cpu_vs_cpu_ranking";

    var rankingDB_ = (function() {
        try { return JSON.parse(window.localStorage.getItem(RANKING_KEY)) || {}; }
        catch(e) { return {}; }
    })();

    function saveRanking() {
        try { window.localStorage.setItem(RANKING_KEY, JSON.stringify(rankingDB_)); } catch(e) {}
    }

    function updateRanking(user, avatar) {
        if (!user) return;
        if (!rankingDB_[user]) rankingDB_[user] = {wins: 0, avatar: avatar || ""};
        rankingDB_[user].wins++;
        if (avatar) rankingDB_[user].avatar = avatar; // atualiza foto se mudou
        saveRanking();
        renderRankingBar();
    }

    function getTop3() {
        return Object.entries(rankingDB_)
            .map(function(e) { return {user: e[0], wins: e[1].wins, avatar: e[1].avatar}; })
            .sort(function(a, b) { return b.wins - a.wins; })
            .slice(0, 3);
    }

    function buildRankingBar() {
        var stage = document.getElementById("pnlStage");
        if (!stage) return;
        var bar = document.createElement("div");
        bar.id = "pnlRankingBar";
        // posicionado absolutamente dentro do palco, no topo
        stage.appendChild(bar);
        renderRankingBar();
    }

    function renderRankingBar() {
        var bar = document.getElementById("pnlRankingBar");
        if (!bar) return;
        var top3 = getTop3();
        if (top3.length === 0) {
            bar.innerHTML = "";
            bar.style.display = "none";
            return;
        }
        bar.style.display = "flex";
        bar.innerHTML = top3.map(function(entry, idx) {
            var medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : "🥉";
            var avatarHtml = entry.avatar
                ? "<img src=\"" + escHtml(entry.avatar) + "\" referrerpolicy=\"no-referrer\" onerror=\"this.style.display='none'\"/>"
                : "<div class=\"rank-initial\">" + escHtml((entry.user || "?").charAt(0).toUpperCase()) + "</div>";
            return "<div class=\"rank-card\" title=\"" + escHtml(entry.user) + "\">" +
                "<div class=\"rank-pos\">" + medal + "</div>" +
                "<div class=\"rank-avatar\">" + avatarHtml + "</div>" +
                "<div class=\"rank-wins\">" + entry.wins + "</div>" +
                "</div>";
        }).join("");
    }

    function tryAdvanceQueue() {
        if (pendingChallenger_ !== null) {
            if (queue_.length >= 1) replaceLoser(pendingChallenger_);
            return;
        }
        if (!hasActiveMatch() && queue_.length >= 2) startFreshFromQueue();
    }

    window.StartRandomCpuBattle = function() {
        var loser = lastKnownDefeatedTeam_;
        var loserTeamNum = loser === CONSTANTS.TEAM1 ? 1 : loser === CONSTANTS.TEAM2 ? 2 : 0;

        if (!loserTeamNum) {
            // sem info de quem perdeu — recomeca do zero
            currentFighters_.team1 = null; currentFighters_.team2 = null;
            if (queue_.length >= 2) startFreshFromQueue();
            else showCover(); // fila sem gente suficiente: mostra a capa em vez de tela preta
            return;
        }
        if (queue_.length >= 1) {
            replaceLoser(loserTeamNum);
        } else {
            // sem desafiante: marca o time perdedor como "vago" e aguarda
            if (loserTeamNum === 1) currentFighters_.team1 = null;
            else currentFighters_.team2 = null;
            pendingChallenger_ = loserTeamNum;
            showCover(); // ninguém na fila pra substituir: capa em vez de tela preta
            sendQueueState(); renderQueueStrip();
        }
    };

    /* ============================================================
     * AVATAR DO SEGUIDOR — segue o SpriteElement do personagem
     * ============================================================ */
    function scheduleApplyAvatars() {
        setTimeout(function tryApply() {
            if (!applyAvatars()) setTimeout(tryApply, 200);
        }, 200);
    }

    var badgeLoopActive_ = false;

    function getOrCreateBadge(stage, teamNum) {
        var id = "pnlBadge" + teamNum;
        var el = document.getElementById(id);
        if (!el) {
            el = document.createElement("div");
            el.id = id;
            el.className = "fighter-avatar-badge";
            //escondido por padrão: só fica visível quando o loop confirmar que
            //o sprite do lutador já está renderizado na posição certa (evita o
            //avatar "flutuando sozinho" um instante antes do jogador aparecer,
            //principalmente na troca de arena/luta)
            el.style.visibility = "hidden";
            stage.appendChild(el);
        }
        return el;
    }

    function applyAvatars() {
        var stage = document.getElementById("pnlStage");
        if (!stage) return false;
        var ok = true;
        [1, 2].forEach(function(teamNum) {
            var t = getTeamObj(teamNum);
            var p = t ? t.getPlayer(0) : null;
            if (!p || !p.SpriteElement) { ok = false; return; }
            var f = teamNum === 1 ? currentFighters_.team1 : currentFighters_.team2;
            var badge = getOrCreateBadge(stage, teamNum);
            if (f && (f.avatar || f.user)) {
                //marca que este badge TEM conteúdo pra mostrar — a visibilidade
                //de fato (visibility) é decidida pelo loop, com base em o sprite
                //já estar visível/posicionado no DOM.
                badge.dataset.hasFighter = "1";
                var wins = f.wins || 0;
                var winsHtml = wins > 0
                    ? "<div class=\"badge-wins\">" + wins + " vitória" + (wins > 1 ? "s" : "") + "</div>"
                    : "";
                if (f.avatar) {
                    badge.innerHTML = "<img src=\"" + escHtml(f.avatar) +
                        "\" referrerpolicy=\"no-referrer\" onerror=\"this.style.display='none'\"/>" + winsHtml;
                } else {
                    badge.innerHTML = "<div class=\"badge-initial\">" +
                        escHtml((f.user||"?").charAt(0).toUpperCase()) + "</div>" + winsHtml;
                }
            } else {
                badge.dataset.hasFighter = "0";
                badge.style.visibility = "hidden";
                badge.innerHTML = "";
            }
        });
        if (ok && !badgeLoopActive_) startBadgeLoop();
        return ok;
    }

    // posiciona os badges acima dos personagens usando coordenadas reais medidas no DOM
    // Retorna um retângulo de tela confiável para o personagem, ou null se o
    // motor ainda não desenhou um quadro de sprite "de verdade" nele.
    //
    // O BUG: this.Element / this.SpriteElement são <div>s de bloco comuns.
    // Antes do motor definir explicitamente a largura do quadro de animação
    // atual (ele faz isso a cada frame, mas leva um instante no exato momento
    // em que uma luta nova começa / troca de arena), um <div> de bloco sem
    // largura própria se estica pra 100% do pai (a arena inteira, ~768 a
    // 1068px) — então getBoundingClientRect() media a arena toda, e o badge
    // "grudava" sempre perto do centro/topo da tela, os dois times juntos,
    // em vez de ficar em cima de cada lutador. Isso é exatamente o que
    // acontecia: ambos os badges ficavam presos no mesmo lugar (centro-topo)
    // porque ambos estavam medindo, na prática, a largura do palco inteiro.
    //
    // A correção: só aceitar a medição se ela tiver um tamanho plausível de
    // personagem (bem menor que a arena) — senão, espera o próximo frame.
    function getPlayerVisualRect(p) {
        var candidates = [p.SpriteElement, p.Element];
        for (var i = 0; i < candidates.length; i++) {
            var el = candidates[i];
            if (!el) continue;
            var declaredWidth = parseInt(el.style.width) || 0;
            if (declaredWidth > 300) continue; // ainda com a largura "cheia" de fallback
            var rect = el.getBoundingClientRect();
            if (rect.width > 0 && rect.width <= 300 && rect.height > 0 && rect.height <= 400) {
                return rect;
            }
        }
        return null;
    }

    function startBadgeLoop() {
        badgeLoopActive_ = true;
        var stage = document.getElementById("pnlStage");

        function loop() {
            if (!stage) { badgeLoopActive_ = false; return; }
            var stageRect = stage.getBoundingClientRect();

            [1, 2].forEach(function(teamNum) {
                var badge = document.getElementById("pnlBadge" + teamNum);
                if (!badge || badge.dataset.hasFighter !== "1") { if (badge) badge.style.visibility = "hidden"; return; }
                var t = getTeamObj(teamNum);
                var p = t ? t.getPlayer(0) : null;
                if (!p) { badge.style.visibility = "hidden"; return; }

                var rect = getPlayerVisualRect(p);
                if (!rect) { badge.style.visibility = "hidden"; return; } // sprite ainda não desenhou um quadro real (troca de arena/luta carregando)

                // centro X do sprite em coordenadas do stage
                var centerX = rect.left + rect.width / 2 - stageRect.left;
                // topo do sprite em coordenadas do stage
                var topY    = rect.top - stageRect.top;

                var bw = badge.offsetWidth || 44;
                badge.style.left   = Math.round(centerX - bw / 2) + "px";
                badge.style.top    = Math.max(4, Math.round(topY) - badge.offsetHeight - 4) + "px";
                badge.style.visibility = "visible";
            });

            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    /* ============================================================
     * FAIXA DE FILA EMBAIXO DO JOGO
     * ============================================================ */
    function getCharLabel(charId) {
        var f = CHAR_INFO.filter(function(c){ return c.id === charId; })[0];
        return f ? f.label : "?";
    }

    function buildQueueStrip() {
        var stage = document.getElementById("pnlStage");
        if (!stage) return;
        var wrapper = document.createElement("div");
        wrapper.id = "pnlQueueStripWrapper";
        var title = document.createElement("div");
        title.id = "pnlQueueStripTitle";
        title.textContent = "🕓 Fila de espera";
        wrapper.appendChild(title);
        var strip = document.createElement("div");
        strip.id = "pnlQueueStrip";
        wrapper.appendChild(strip);
        document.body.appendChild(wrapper);
        positionQueueStrip();
        window.addEventListener("resize", positionQueueStrip);
        renderQueueStrip();
    }

    function positionQueueStrip() {
        var stage = document.getElementById("pnlStage");
        var wrapper = document.getElementById("pnlQueueStripWrapper");
        if (!stage || !wrapper) return;
        var r = stage.getBoundingClientRect();
        wrapper.style.position = "absolute";
        wrapper.style.left = (window.scrollX + r.left) + "px";
        wrapper.style.top  = (window.scrollY + r.bottom) + "px";
        wrapper.style.width = r.width + "px";
    }

    /* ============================================================
     * CAPA (TELA "JOGAR!") — alinhada com a arena
     * A capa (.start-game-container, com a imagem assets/capa.png)
     * antes ficava com 50% da largura da JANELA, o que não tinha
     * nenhuma relação com o tamanho real da arena (#pnlStage) — por
     * isso ficava menor/desalinhada em relação à arena e à faixa de
     * fila (que já é medida a partir do retângulo real da arena).
     * Aqui aplicamos a mesma lógica de positionQueueStrip(): a capa
     * passa a ocupar exatamente o retângulo da arena, ficando do
     * mesmo tamanho e alinhada com ela (e, por consequência, com a
     * lista de espera logo abaixo).
     * ============================================================ */
    function positionCoverImage() {
        var stage = document.getElementById("pnlStage");
        var cover = document.querySelector(".start-game-container");
        if (!stage || !cover) return;
        var r = stage.getBoundingClientRect();
        cover.style.position = "absolute";
        cover.style.left = (window.scrollX + r.left) + "px";
        cover.style.top = (window.scrollY + r.top) + "px";
        cover.style.width = r.width + "px";
        cover.style.height = r.height + "px";
    }

    /* ============================================================
     * CAPA COMO "TELA DE ESPERA" — quando não há gente suficiente na
     * fila pra começar/continuar uma luta, o motor simplesmente para
     * de desenhar (sem novo debug_.startMatch), o que deixava a arena
     * preta. Em vez disso, reaproveitamos a mesma capa (.start-game-
     * -container, assets/capa.png) como tela de espera: ela some de
     * novo assim que uma luta de fato começa (spawnFighters).
     * ============================================================ */
    function showCover() {
        var cover = document.querySelector(".start-game-container");
        if (!cover) return;
        positionCoverImage();
        cover.style.display = "";
    }
    function hideCover() {
        var cover = document.querySelector(".start-game-container");
        if (!cover) return;
        cover.style.display = "none";
    }

    /* ============================================================
     * BARRA DE AÇÕES — "Nova luta" + "⚙️ Conf." fixada logo abaixo
     * da lista de espera (mesma lógica de posicionamento: mede o
     * retângulo real da fila no DOM e se encaixa embaixo dela).
     * O botão "Conf." abre a gaveta do painel embutida no próprio
     * HTML do jogo (função togglePainelConfig, definida no final
     * do cpu-vs-cpu.htm).
     * ============================================================ */
    function buildActionBar() {
        var bar = document.createElement("div");
        bar.id = "pnlActionBar";

        var btnNew = document.createElement("button");
        btnNew.className = "pnl-action-btn pnl-action-btn-red";
        btnNew.type = "button";
        btnNew.innerHTML = "🥊 Nova luta";
        btnNew.onclick = function () {
            if (typeof StartRandomCpuBattle === "function") StartRandomCpuBattle();
        };

        var btnConf = document.createElement("button");
        btnConf.className = "pnl-action-btn pnl-action-btn-gray";
        btnConf.type = "button";
        btnConf.innerHTML = "⚙️ Conf.";
        btnConf.onclick = function () {
            if (typeof window.togglePainelConfig === "function") window.togglePainelConfig();
        };

        bar.appendChild(btnNew);
        bar.appendChild(btnConf);
        document.body.appendChild(bar);

        positionActionBar();
        window.addEventListener("resize", positionActionBar);
    }

    function positionActionBar() {
        var wrapper = document.getElementById("pnlQueueStripWrapper");
        var bar = document.getElementById("pnlActionBar");
        if (!wrapper || !bar) return;
        var r = wrapper.getBoundingClientRect();
        bar.style.position = "absolute";
        bar.style.left = (window.scrollX + r.left) + "px";
        bar.style.top  = (window.scrollY + r.bottom + 8) + "px";
        bar.style.width = r.width + "px";
    }

    function renderQueueStrip() {
        var strip = document.getElementById("pnlQueueStrip");
        if (!strip) return;
        if (queue_.length === 0) {
            strip.innerHTML = "<div class=\"queue-empty\">Fila vazia — chame os seguidores pra lutar!</div>";
            return;
        }
        strip.innerHTML = queue_.map(function(entry, idx) {
            var avatarHtml = entry.avatar
                ? "<img class=\"queue-avatar-img\" src=\"" + escHtml(entry.avatar) + "\" referrerpolicy=\"no-referrer\" onerror=\"this.style.display='none'\"/>"
                : "<div class=\"queue-avatar-placeholder\">" + escHtml((entry.user||"?").charAt(0).toUpperCase()) + "</div>";
            return "<div class=\"queue-card\">" +
                "<div class=\"queue-pos\">#" + (idx+1) + "</div>" +
                "<div class=\"queue-char-portrait\" data-char=\"" + entry.character + "\"></div>" +
                "<div class=\"queue-char-name\">" + escHtml(getCharLabel(entry.character)) + "</div>" +
                "<div class=\"queue-avatar-wrap\">" + avatarHtml + "</div>" +
                "</div>";
        }).join("");
        // aplica spritesheet no retrato
        strip.querySelectorAll(".queue-char-portrait").forEach(function(el) {
            applyHeadSprite(el, +el.getAttribute("data-char"));
        });
    }

    // spritesheet 1792×576, células 256×288 (copiado de load-spritedata.js)
    var HEAD_COORDS = {};
    HEAD_COORDS[CHARACTERS.AKUMA]  = {x:256, y:0};
    HEAD_COORDS[CHARACTERS.KEN]    = {x:0,   y:288};
    HEAD_COORDS[CHARACTERS.MBISON] = {x:256, y:288};
    HEAD_COORDS[CHARACTERS.RYU]    = {x:768, y:288};
    HEAD_COORDS[CHARACTERS.SAGAT]  = {x:1024,y:288};

    function applyHeadSprite(el, charId) {
        var coords = HEAD_COORDS[charId] || HEAD_COORDS[CHARACTERS.RYU];
        var size = 56; // tamanho desejado do retrato
        var scale = size / 256;
        el.style.backgroundImage = "url(images/misc/misc/head-sprites.png)";
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundSize  = (1792*scale)+"px "+(576*scale)+"px";
        el.style.backgroundPosition = (-coords.x*scale)+"px "+(-coords.y*scale)+"px";
    }

    /* ============================================================
     * POLLING — cache do time derrotado + envio de estado pro painel
     * ============================================================ */
    function cacheDefeatedTeam() {
        var m = getMatchSafe();
        if (m) {
            var d = m.getDefeatedTeam();
            if (d === CONSTANTS.TEAM1 || d === CONSTANTS.TEAM2) lastKnownDefeatedTeam_ = d;
        }
    }

    function getGameStats() {
        var m = getMatchSafe();
        if (!m) return {playing: false};
        var tA = m.getTeamA(), tB = m.getTeamB();
        var pA = tA ? tA.getPlayer(0) : null, pB = tB ? tB.getPlayer(0) : null;
        if (!pA || !pB) return {playing: false};
        return {
            playing: true,
            team1: { name: pA.getName(), health: tA.getHealthbar().getAmount(), healthMax: tA.getHealthbar().getMax(), energy: tA.getEnergybar().getAmount(), fighter: currentFighters_.team1 },
            team2: { name: pB.getName(), health: tB.getHealthbar().getAmount(), healthMax: tB.getHealthbar().getMax(), energy: tB.getEnergybar().getAmount(), fighter: currentFighters_.team2 }
        };
    }

    function sendGameState() {
        if (!panelChannel_) return;
        try { panelChannel_.postMessage({type:"GAME_STATE", stats: getGameStats()}); } catch(e){}
    }

    function sendQueueState() {
        if (!panelChannel_) return;
        try { panelChannel_.postMessage({type:"QUEUE_STATE", queue: queue_, currentFighters: currentFighters_, forcedStage: forcedStageKey_}); } catch(e){}
    }

    /* ============================================================
     * AÇÕES — despachadas pelo painel-live.html via BroadcastChannel
     *
     * TODAS as ações de golpe/poder verificam se o remetente (msg.user)
     * está de fato lutando agora antes de executar — quem não está na
     * arena NÃO consegue acionar nada.
     * ============================================================ */
    var ACTION_HANDLERS = {

        // — Entrar na fila —
        JOIN_QUEUE: function(msg) {
            addToQueue(msg && msg.character, msg && msg.user, msg && msg.avatar);
        },

        // — Ações de golpe/poder: exigem que msg.user esteja lutando agora —

        LUTA_AUTOMATICA: function(msg) {
            // soco ou chute fraco/médio aleatório
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            executeMoveRandom(team, "basic");
            showToast((msg.user||"?") + " ativou: golpe automático!");
        },

        // — Restaurar sangue: sempre por comando do seguidor, nunca aleatório —
        RESTAURAR_SANGUE_10: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            restoreHealthPercent(team, 10);
            showToast((msg.user||"?") + " restaurou 10% de sangue!");
        },
        RESTAURAR_SANGUE_30: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            restoreHealthPercent(team, 30);
            showToast((msg.user||"?") + " restaurou 30% de sangue!");
        },
        RESTAURAR_SANGUE_50: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            restoreHealthPercent(team, 50);
            showToast((msg.user||"?") + " restaurou 50% de sangue!");
        },
        RESTAURAR_SANGUE_100: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            restoreHealthPercent(team, 100);
            showToast((msg.user||"?") + " restaurou 100% de sangue!");
        },

        // — Barra de energia especial: sempre por comando do seguidor, nunca aleatório —
        RECARREGA_ESPECIAL_10: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            givePowerPercent(team, 10);
            showToast((msg.user||"?") + " deu 10% de energia!");
        },
        RECARREGA_ESPECIAL_30: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            givePowerPercent(team, 30);
            showToast((msg.user||"?") + " deu 30% de energia!");
        },
        RECARREGA_ESPECIAL_50: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            givePowerPercent(team, 50);
            showToast((msg.user||"?") + " deu 50% de energia!");
        },
        RECARREGA_ESPECIAL_100: function(msg) {
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            givePowerPercent(team, 100);
            showToast((msg.user||"?") + " encheu a energia ao máximo!");
        },

        PODERES_ALEATORIO: function(msg) {
            // golpe especial aleatório do personagem (sem ser super)
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            executeMoveRandom(team, "special");
            showToast((msg.user||"?") + " usou poder aleatório!");
        },

        COMBO_ESPECIAL: function(msg) {
            // poder máximo + super golpe (2 em 1)
            var team = findTeamForUser(msg && msg.user);
            if (!team) return;
            giveFullPower(team);
            executeMoveRandom(team, "combo");
            showToast((msg.user||"?") + " ativou COMBO ESPECIAL!");
        },

        // — Ações de spawn (não precisam de trava de identidade) —
        SPAWN_RANDOM: function() { spawnRandom(); },
        SPAWN_CHOSEN: function(msg) {
            if (msg && msg.char1 !== undefined && msg.char2 !== undefined)
                spawnFighters(msg.char1, msg.char2, msg.stage || null);
        },

        // — Fixa (ou libera) a arena usada em toda luta nova a partir de agora —
        // msg.stage: chave da arena (ex.: "sagat") para fixar, ou "" / ausente
        // para voltar a sortear aleatoriamente a cada luta.
        TROCAR_ARENA: function(msg) {
            var key = (msg && msg.stage) || "";
            forcedStageKey_ = key;
            saveForcedStage();
            var found = STAGE_INFO.filter(function(s){ return s.key === key; })[0];
            showToast(found ? ("Arena fixada: " + found.label) : "Arena voltou a ser aleatória");
            sendQueueState();
        },

        // — Zera o ranking Top 3 e esvazia a fila de espera (botão do painel) —
        RESETAR_RANKING_FILA: function() {
            queue_ = [];
            pendingChallenger_ = null;
            saveQueue();

            rankingDB_ = {};
            saveRanking();

            sendQueueState();
            renderQueueStrip();
            renderRankingBar();
            showToast("Ranking e fila de espera resetados!");
        }
    };

    /* ============================================================
     * BROADCASTCHANNEL — comunicação com painel-live.html
     * ============================================================ */
    function initChannel() {
        if (typeof BroadcastChannel === "undefined") return;
        panelChannel_ = new BroadcastChannel(PANEL_CHANNEL);

        panelChannel_.onmessage = function(ev) {
            var msg = ev.data;
            if (!msg || !msg.type) return;
            if (msg.type === "PING") {
                try { panelChannel_.postMessage({type:"PONG"}); } catch(e){}
                sendGameState(); sendQueueState();
                return;
            }
            if (msg.type === "EXECUTE_ACTION") {
                var handler = ACTION_HANDLERS[msg.action];
                if (handler) handler(msg);
                return;
            }
        };

        setInterval(sendGameState,   1000);
        setInterval(cacheDefeatedTeam, 200);
        try { panelChannel_.postMessage({type:"READY"}); } catch(e){}
    }

    /* ============================================================
     * CSS
     * ============================================================ */
    function injectStyles() {
        var css = [
            /* toast de notificação */
            "#pnlPainelToast{position:fixed;left:50%;top:14px;transform:translateX(-50%) translateY(-20px);background:#111;border:1px solid #ffcc00;color:#ffcc00;padding:8px 16px;border-radius:6px;font-family:Arial,sans-serif;font-size:13px;z-index:100000;opacity:0;transition:.25s;pointer-events:none;}",
            "#pnlPainelToast.show{opacity:1;transform:translateX(-50%) translateY(0);}",

            /* INSERT COIN / PRESS 1P — escondidos permanentemente */
            ".insert-coin,.press-start,#pnlInsertCoin,#pnlPressStart{display:none !important;}",

            /* avatar badge — filho do SpriteElement, sobe acima do topo do sprite */
            /* avatar badge — posicionado absolutamente no pnlStage via JS (requestAnimationFrame) */
            ".fighter-avatar-badge{position:absolute;z-index:90;display:flex;flex-direction:column;align-items:center;gap:2px;pointer-events:none;white-space:nowrap;}",
            ".fighter-avatar-badge img,.badge-initial{width:42px;height:42px;border-radius:50%;border:2px solid #ffcc00;box-shadow:0 0 6px rgba(0,0,0,.8);object-fit:cover;background:#222;display:block;}",
            ".badge-initial{display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-size:18px;font-weight:700;color:#fff;}",
            ".badge-wins{background:rgba(0,0,0,.7);color:#ffcc00;font-family:Arial,sans-serif;font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;text-align:center;}",

            /* faixa de fila */
            "#pnlQueueStripWrapper{background:linear-gradient(180deg,#15151c,#0a0a0e);border:2px solid #ffcc00;border-top:none;border-radius:0 0 10px 10px;padding:8px 10px;z-index:40;box-sizing:border-box;}",
            "#pnlQueueStripTitle{font-family:Arial,sans-serif;font-size:12px;font-weight:700;color:#ffcc00;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;}",
            /* overflow-x continua ativo (dá pra arrastar/rolar com o mouse), só a barra visual some */
            "#pnlQueueStrip{display:flex;gap:8px;overflow-x:auto;padding-bottom:4px;min-height:130px;scrollbar-width:none;-ms-overflow-style:none;}",
            "#pnlQueueStrip::-webkit-scrollbar{display:none;height:0;width:0;}",
            ".queue-empty{color:#888;font-family:Arial,sans-serif;font-size:12px;padding:20px 0;width:100%;text-align:center;}",
            ".queue-card{flex-shrink:0;width:92px;background:#1b1b24;border:1px solid #333;border-radius:8px;padding:6px 4px;display:flex;flex-direction:column;align-items:center;gap:4px;position:relative;}",
            ".queue-pos{position:absolute;top:2px;left:4px;font-family:Arial,sans-serif;font-size:9px;color:#ffcc00;font-weight:700;}",
            ".queue-char-portrait{width:56px;height:56px;border-radius:6px;background-color:#2a2a35;border:1px solid #444;}",
            ".queue-char-name{font-family:Arial,sans-serif;font-size:9px;color:#ccc;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:88px;}",
            ".queue-avatar-img{width:56px;height:56px;border-radius:50%;border:3px solid #ffcc00;object-fit:cover;background:#222;display:block;box-shadow:0 0 8px rgba(255,204,0,.4);}",
            ".queue-avatar-placeholder{width:56px;height:56px;border-radius:50%;border:3px solid #ffcc00;background:#444;color:#fff;font-family:Arial,sans-serif;font-size:22px;font-weight:700;display:flex;align-items:center;justify-content:center;}",

            /* barra de ações — "Nova luta" + "Conf." fixada embaixo da fila */
            "#pnlActionBar{display:flex;gap:10px;z-index:40;}",
            ".pnl-action-btn{flex:1;padding:11px 14px;border:none;border-radius:8px;font-family:Arial,sans-serif;font-size:14px;font-weight:700;letter-spacing:.3px;cursor:pointer;transition:filter .15s, transform .1s;box-shadow:0 2px 8px rgba(0,0,0,.5);}",
            ".pnl-action-btn:hover{filter:brightness(1.12);}",
            ".pnl-action-btn:active{transform:translateY(1px);}",
            ".pnl-action-btn-red{background:linear-gradient(180deg,#e8312a,#a91d18);color:#fff;}",
            ".pnl-action-btn-gray{background:linear-gradient(180deg,#2a2b38,#191a27);color:#ffcc00;border:1px solid #333;flex:0 0 110px;}",

            /* ranking top 3 — faixa horizontal no topo do palco */
            "#pnlRankingBar{position:absolute;top:0;left:0;right:0;z-index:90;display:flex;justify-content:center;align-items:flex-end;gap:4px;padding:4px 8px;background:linear-gradient(180deg,rgba(0,0,0,.75) 0%,rgba(0,0,0,0) 100%);pointer-events:none;}",
            ".rank-card{display:flex;flex-direction:column;align-items:center;gap:2px;width:52px;}",
            ".rank-pos{font-family:Arial,sans-serif;font-size:10px;font-weight:700;color:#ffcc00;text-shadow:0 1px 3px rgba(0,0,0,.9);line-height:1;}",
            ".rank-avatar img,.rank-initial{width:38px;height:38px;border-radius:50%;border:2px solid #ffcc00;object-fit:cover;background:#222;box-shadow:0 0 8px rgba(0,0,0,.8);}",
            ".rank-initial{display:flex;align-items:center;justify-content:center;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#fff;}",
            ".rank-wins{font-family:Arial,sans-serif;font-size:16px;font-weight:900;color:#fff;background:rgba(0,0,0,.65);padding:1px 7px;border-radius:4px;line-height:1.3;text-shadow:0 1px 2px rgba(0,0,0,.9);}"
        ].join("\n");

        var style = document.createElement("style");
        style.appendChild(document.createTextNode(css));
        document.head.appendChild(style);
    }

    /* ============================================================
     * INICIALIZAÇÃO
     * ============================================================ */
    function init() {
        injectStyles();
        positionCoverImage();
        window.addEventListener("resize", positionCoverImage);
        buildQueueStrip();
        buildActionBar();
        buildRankingBar();

        // toast
        var toast = document.createElement("div");
        toast.id = "pnlPainelToast";
        document.body.appendChild(toast);

        initChannel();
    }

    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(init, 0);
    } else {
        document.addEventListener("DOMContentLoaded", init);
    }
})();
