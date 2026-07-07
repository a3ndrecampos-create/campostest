/* ============================================================
   app.js — lógica do painel (StreamToEarn-like)
   ============================================================ */

const MAX_TRIGGERS = 6; // limite do plano, igual ao print ("Limit: 16/6")

let state = seedIfEmpty(loadState());
let pendingGameId = null;      // usado ao criar preset novo
let pendingAudioTarget = null; // trigger sendo editado no modal de áudio
let editingTriggerId = null;   // trigger sendo editado no modal de gatilho
let selectedGiftId = null;     // presente escolhido no modal de gatilho

/* ---------------- Autenticação / licenças (Supabase) ---------------- */
let exclusiveGamesCache = [];  // jogos exclusivos carregados do Supabase (ou fallback)
let licencasLiberadas = [];    // jogo_id liberados para o e-mail verificado
let userEmail = "";
let isVerified = false;

/* ---------------- Navegação entre abas ---------------- */

function showView(name) {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav button").forEach(b => b.classList.remove("active"));
  document.getElementById(`view-${name}`).classList.add("active");
  document.querySelector(`.nav button[data-view="${name}"]`).classList.add("active");
  if (name === "presets") { renderPresetsList(); renderSidebarGamesList(""); }
  if (name === "overlays") renderOverlaysView();
  if (name === "exclusivos") renderExclusivosGrid("");
  if (name === "games") renderGamesGrid("");
}

/* ---------------- Helpers de jogo ---------------- */

function gameById(id) {
  return GAMES.find(g => g.id === id)
    || exclusiveGamesCache.find(g => g.id === id)
    || { id: "unknown", name: "Jogo" };
}

function imgWithFallback(src, alt, cssClass) {
  return `<img src="${src}" alt="${alt}" class="${cssClass || ""}"
    onerror="this.onerror=null; this.src='data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100'><rect width='100%' height='100%' fill='%231e222b'/><text x='50%' y='55%' font-size='12' fill='%239299a6' text-anchor='middle' font-family='sans-serif'>sem imagem</text></svg>`
    )}';" />`;
}

/* ---------------- PRESETS: lista ---------------- */

function renderPresetsList() {
  const wrap = document.getElementById("presets-list");
  const countLabel = document.getElementById("presets-count");
  countLabel.textContent = `My Presets ${state.presets.length}/3`;

  if (state.presets.length === 0) {
    wrap.innerHTML = `<div class="empty-state">
      <div class="big">Nenhum preset ainda</div>
      Escolha um jogo ao lado para criar seu primeiro preset.
    </div>`;
    return;
  }

  wrap.innerHTML = state.presets.map(p => {
    const game = gameById(p.gameId);
    const actionTypes = (typeof getActionsForPreset === "function") ? getActionsForPreset(p) : ACTION_TYPES;
    const thumbs = p.triggers.slice(0, 8).map(t => {
      const action = actionTypes.find(a => a.id === t.actionId);
      const iconPath = action
        ? (isExclusiveGame(p.gameId) ? exclusiveActionIconPath(p.gameId, action.id) : actionIconPath(p.gameId, action.id))
        : null;
      if (iconPath) {
        return `<div class="more" title="${action ? action.label : ""}" style="padding:0;overflow:hidden;">
          <img src="${iconPath}" alt="${action.label}" style="width:100%;height:100%;object-fit:contain;"
               onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">
          <span style="display:none; align-items:center; justify-content:center; width:100%; height:100%; font-size:18px;">${action.icon}</span>
        </div>`;
      }
      return `<div class="more" title="${action ? action.label : ""}">${action ? action.icon : "•"}</div>`;
    }).join("");
    const extra = p.triggers.length > 8 ? `<div class="more">+${p.triggers.length - 8}</div>` : "";
    return `
      <div class="preset-card">
        <div class="info">
          <div class="title">${p.name}</div>
          <div class="meta">
            Jogo: ${game.name}<br>
            Eventos: ${p.triggers.length}<br>
            Criado: ${p.createdAt}
          </div>
        </div>
        <div class="thumbs">${thumbs || '<div class="more">vazio</div>'}${extra}</div>
        <div class="actions">
          <button class="btn btn-primary btn-icon" title="Editar" onclick="openEditor('${p.id}')">✏️</button>
          <button class="btn btn-ghost btn-icon" title="Duplicar" onclick="duplicatePreset('${p.id}')">📋</button>
          <button class="btn btn-danger btn-icon" title="Excluir" onclick="deletePreset('${p.id}')">🗑️</button>
        </div>
      </div>`;
  }).join("");
}

function duplicatePreset(id) {
  const p = state.presets.find(x => x.id === id);
  if (!p) return;
  const copy = JSON.parse(JSON.stringify(p));
  copy.id = uid();
  copy.name = p.name + " (cópia)";
  copy.createdAt = new Date().toISOString().slice(0, 10);
  copy.triggers.forEach(t => t.id = uid());
  state.presets.push(copy);
  saveState(state);
  renderPresetsList();
  toast("Preset duplicado");
}

function deletePreset(id) {
  if (!confirm("Excluir este preset? Essa ação não pode ser desfeita.")) return;
  state.presets = state.presets.filter(p => p.id !== id);
  if (state.activePresetId === id) state.activePresetId = null;
  saveState(state);
  renderPresetsList();
  toast("Preset excluído");
}

/* ---------------- Modal: escolher jogo (novo preset) ---------------- */

function openGameModal() {
  document.getElementById("modal-games").classList.add("active");
  renderGameGrid("");
}
function closeGameModal() {
  document.getElementById("modal-games").classList.remove("active");
}
function renderGameGrid(filter) {
  const grid = document.getElementById("games-grid");
  const f = filter.trim().toLowerCase();
  const list = GAMES.filter(g => g.name.toLowerCase().includes(f));
  grid.innerHTML = list.map(g => `
    <button class="game-tile" onclick="createPresetForGame('${g.id}')">
      ${imgWithFallback(gameCoverPath(g.id), g.name)}
      <div class="label">${g.name}</div>
    </button>`).join("") || `<div class="help-text">Nenhum jogo encontrado.</div>`;
}

/* ---------------- Lista lateral: jogos EXCLUSIVOS liberados para o usuário ---------------- */
// Mostra só os jogos exclusivos (Supabase) que o usuário já tem liberado
// (grátis ou com licença ativa). Os jogos "comuns" continuam no botão
// "Escolher jogo…" (modal com busca), sem mudanças.
function renderSidebarGamesList(filter) {
  const wrap = document.getElementById("sidebar-games-list");
  if (!wrap) return;
  const f = (filter || "").trim().toLowerCase();

  const exclusivosLiberados = exclusiveGamesCache
    .filter(g => !g.isPremium || licencasLiberadas.includes(String(g.id).toLowerCase().trim()))
    .filter(g => g.name.toLowerCase().includes(f));

  if (exclusivosLiberados.length === 0) {
    wrap.innerHTML = `<div class="help-text" style="text-align:center;padding:8px 0;">Nenhum jogo exclusivo liberado ainda.</div>`;
    return;
  }

  wrap.innerHTML = exclusivosLiberados.map(g => `
    <button class="sidebar-game-item" onclick="createPresetForGame('${g.id}')">
      ${imgWithFallback(gameCoverPath(g.id), g.name)}
      <div class="name">${g.name}</div>
    </button>`).join("");
}

function createPresetForGame(gameId) {
  const game = gameById(gameId);
  const preset = {
    id: uid(),
    name: game.name,
    gameId: gameId,
    createdAt: new Date().toISOString().slice(0, 10),
    triggers: [],
  };
  state.presets.push(preset);
  saveState(state);
  closeGameModal();
  renderPresetsList();
  openEditor(preset.id);
  toast(`Preset "${game.name}" criado`);
}

/* ---------------- EDITOR de preset ---------------- */

function openEditor(presetId) {
  state.activePresetId = presetId;
  saveState(state);
  showEditorView();
}

function showEditorView() {
  document.querySelectorAll(".view").forEach(v => v.classList.remove("active"));
  document.querySelectorAll(".nav button").forEach(b => b.classList.remove("active"));
  document.getElementById("view-editor").classList.add("active");
  document.querySelector('.nav button[data-view="presets"]').classList.add("active");
  renderEditor();
}

function activePreset() {
  return state.presets.find(p => p.id === state.activePresetId);
}

// Caminho do PNG customizado de cada ação, específico por jogo (se existir).
// Convenção: assets/games/<gameId>/eventos/<action_id_minusculo>.png
// (jogos exclusivos, como o Pipa Interativa, usam assets/games-exclusive/<id>/eventos/...)
function actionIconPath(gameId, actionId) {
  const base = isExclusiveGame(gameId) ? "assets/games-exclusive" : "assets/games";
  return `${base}/${gameId}/eventos/${String(actionId).toLowerCase()}.png`;
}

function renderEditor() {
  const p = activePreset();
  if (!p) { showView("presets"); return; }
  const game = gameById(p.gameId);

  document.getElementById("editor-preset-name").textContent = p.name;
  document.getElementById("editor-preset-id").textContent = p.id.slice(0, 16);
  document.getElementById("editor-game-thumb").src = gameCoverPath(p.gameId);
  document.getElementById("editor-game-thumb").onerror = function () { this.src = ""; this.style.background = "#1e222b"; };
  document.getElementById("editor-game-name").textContent = game.name;
  const actionsForThisGame = (typeof getActionsForPreset === "function") ? getActionsForPreset(p) : ACTION_TYPES;
  document.getElementById("editor-limit").textContent = `Limit: ${actionsForThisGame.length}/${MAX_TRIGGERS}`;

  const list = document.getElementById("triggers-list");
  if (p.triggers.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div class="big">Nenhum gatilho configurado</div>
      Clique em "New Trigger" para criar sua primeira ação (ex.: Follow → Spawn Zombie).
    </div>`;
  } else {
    list.innerHTML = p.triggers.map((t, idx) => renderTriggerRow(t, idx, p.triggers.length)).join("");
  }

  const note = document.getElementById("limit-note");
  note.textContent = `Nesta versão da conta, você pode ter no máximo ${MAX_TRIGGERS} eventos.`;
  note.classList.toggle("over", p.triggers.length > MAX_TRIGGERS);

  document.getElementById("btn-new-trigger").disabled = false;
}

function renderTriggerRow(t, idx, total) {
  const p = activePreset();
  const evt = EVENT_TYPES.find(e => e.id === t.eventId) || EVENT_TYPES[0];
  const action = ACTION_TYPES.find(a => a.id === t.actionId) || ACTION_TYPES[0];
  const gift = t.giftId ? GIFT_CATALOG.find(g => g.id === t.giftId) : null;

  let extraLine = "";
  if (evt.id === "gift") {
    extraLine = `<div class="extra">${gift ? gift.fallback : "🎁"} ${t.count || 1} ${gift ? gift.label : "(sem presente)"}</div>`;
  } else if (evt.needsCount) {
    extraLine = `<div class="extra">${t.count || 1} Likes</div>`;
  } else if (evt.needsText) {
    extraLine = `<div class="extra">${t.text || ""}</div>`;
  }

  const command = (action.template || "")
    .replace("{variant}", t.param || "zombie")
    .replace("{item}", t.param || "item")
    .replace("{amount}", t.param || "0")
    .replace("{custom}", t.param || "");

  const iconPath = p ? actionIconPath(p.gameId, action.id) : null;

  return `
    <div class="trigger">
      <div class="reorder">
        <button ${idx === 0 ? "disabled" : ""} onclick="moveTrigger('${t.id}', -1)">▲</button>
        <button ${idx === total - 1 ? "disabled" : ""} onclick="moveTrigger('${t.id}', 1)">▼</button>
      </div>
      <div class="event">
        <div class="who">Anyone</div>
        <div class="kind">${evt.icon} ${evt.label}</div>
        ${extraLine}
      </div>
      <div class="action-icon">
        ${iconPath ? `<img src="${iconPath}" alt="${action.label}" style="width:100%;height:100%;object-fit:contain;"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
        <span style="display:none">${action.icon}</span>` : action.icon}
      </div>
      <div class="action">
        <div class="name">${action.label}</div>
        <div class="details">
          <span>Repetição: <b>${t.repetition || 1}</b></span>
          <span>Intervalo: <b>${t.interval || 100}</b></span>
          <span>Delay: <b>${t.delay || 0}</b></span>
          <span class="link" onclick="editTrigger('${t.id}')">${command}</span>
        </div>
      </div>
      <div class="audio">
        <div class="name">${t.audioName || "Nenhum áudio"}</div>
        <div class="vol">Volume: ${t.audioVolume ?? 100}%</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-icon btn-sm" title="Testar" onclick="testTrigger('${t.id}')">▶</button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="editTrigger('${t.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Duplicar" onclick="duplicateTrigger('${t.id}')">📋</button>
        <button class="btn btn-danger btn-icon btn-sm" title="Excluir" onclick="deleteTrigger('${t.id}')">🗑️</button>
      </div>
    </div>`;
}

function moveTrigger(id, dir) {
  const p = activePreset();
  const i = p.triggers.findIndex(t => t.id === id);
  const j = i + dir;
  if (j < 0 || j >= p.triggers.length) return;
  [p.triggers[i], p.triggers[j]] = [p.triggers[j], p.triggers[i]];
  saveState(state);
  renderEditor();
}

function duplicateTrigger(id) {
  const p = activePreset();
  const t = p.triggers.find(x => x.id === id);
  const copy = JSON.parse(JSON.stringify(t));
  copy.id = uid();
  p.triggers.push(copy);
  saveState(state);
  renderEditor();
}

function deleteTrigger(id) {
  const p = activePreset();
  p.triggers = p.triggers.filter(t => t.id !== id);
  saveState(state);
  renderEditor();
}

function testTrigger(id) {
  toast("Disparando gatilho de teste…");
}

function deletePresetFromEditor() {
  const p = activePreset();
  if (!p) return;
  if (!confirm(`Excluir o preset "${p.name}"?`)) return;
  deletePreset(p.id);
  showView("presets");
}

function savePresetFromEditor() {
  saveState(state);
  connectTikFinity(); // garante conexão com o TikFinity usando a lista de ações atualizada
  toast("Preset salvo com sucesso");
}

/* ---------------- Modal: Novo gatilho / editar gatilho ---------------- */

function openTriggerModal(triggerId) {
  editingTriggerId = triggerId || null;
  const p = activePreset();
  const t = triggerId ? p.triggers.find(x => x.id === triggerId) : null;

  document.getElementById("trigger-modal-title").textContent = t ? "Editar Gatilho" : "Novo Gatilho";

  const evtSelect = document.getElementById("f-event");
  evtSelect.innerHTML = EVENT_TYPES.map(e => `<option value="${e.id}">${e.icon} ${e.label}</option>`).join("");
  evtSelect.value = t ? t.eventId : EVENT_TYPES[0].id;

  const actSelect = document.getElementById("f-action");
  actSelect.innerHTML = ACTION_TYPES.map(a => `<option value="${a.id}">${a.icon} ${a.label}</option>`).join("");
  actSelect.value = t ? t.actionId : ACTION_TYPES[0].id;

  selectedGiftId = t?.giftId || null;
  renderGiftGrid();

  document.getElementById("f-count").value = t?.count || 1;
  document.getElementById("f-text").value = t?.text || "";
  document.getElementById("f-param").value = t?.param || "";
  document.getElementById("f-repetition").value = t?.repetition || 1;
  document.getElementById("f-interval").value = t?.interval || 100;
  document.getElementById("f-delay").value = t?.delay || 0;
  document.getElementById("f-multiplier").checked = !!t?.multiplier;
  document.getElementById("f-audio-name").value = t?.audioName || "";
  document.getElementById("f-audio-volume").value = t?.audioVolume ?? 100;

  updateTriggerFieldVisibility();
  document.getElementById("modal-trigger").classList.add("active");
}

function editTrigger(id) { openTriggerModal(id); }

function closeTriggerModal() {
  document.getElementById("modal-trigger").classList.remove("active");
  editingTriggerId = null;
}

function updateTriggerFieldVisibility() {
  const evtId = document.getElementById("f-event").value;
  const evt = EVENT_TYPES.find(e => e.id === evtId);
  document.getElementById("row-count").style.display = evt.needsCount ? "block" : "none";
  document.getElementById("row-text").style.display = evt.needsText ? "block" : "none";
  document.getElementById("row-gift").style.display = evt.needsGiftPicker ? "block" : "none";
  if (evt.countLabel) document.getElementById("f-count-label").textContent = evt.countLabel;
  if (evt.textLabel) document.getElementById("f-text-label").textContent = evt.textLabel;
  if (evt.needsGiftPicker) renderGiftGrid();
}

function renderGiftGrid() {
  const grid = document.getElementById("gift-grid");
  if (!grid) return;
  grid.innerHTML = GIFT_CATALOG.map(g => `
    <button type="button" class="gift-tile ${g.id === selectedGiftId ? "selected" : ""}" onclick="selectGift('${g.id}')">
      <img src="${g.icon}" alt="${g.label}" class="gift-icon"
        onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'emoji', textContent:'${g.fallback}'}))">
      <div class="gname">${g.label}</div>
      <div class="gcoins">🪙 ${g.coins}</div>
    </button>`).join("");
  const label = document.getElementById("gift-selected-label");
  if (label) {
    const g = GIFT_CATALOG.find(x => x.id === selectedGiftId);
    label.textContent = g ? `Selecionado: ${g.label}` : "Nenhum presente selecionado ainda.";
  }
}

function selectGift(giftId) {
  selectedGiftId = giftId;
  renderGiftGrid();
}

function saveTriggerFromModal() {
  const p = activePreset();
  if (!p) return;

  if (!editingTriggerId && p.triggers.length >= MAX_TRIGGERS) {
    if (!confirm(`Você já atingiu o limite de ${MAX_TRIGGERS} eventos deste plano. Deseja adicionar mesmo assim (pode ficar bloqueado até fazer upgrade)?`)) {
      return;
    }
  }

  const evtIdSel = document.getElementById("f-event").value;
  const evtSel = EVENT_TYPES.find(e => e.id === evtIdSel);
  if (evtSel.needsGiftPicker && !selectedGiftId) {
    alert("Escolha um presente antes de salvar.");
    return;
  }

  const data = {
    eventId: evtIdSel,
    giftId: evtSel.needsGiftPicker ? selectedGiftId : null,
    actionId: document.getElementById("f-action").value,
    count: parseInt(document.getElementById("f-count").value || "1", 10),
    text: document.getElementById("f-text").value,
    param: document.getElementById("f-param").value,
    repetition: parseInt(document.getElementById("f-repetition").value || "1", 10),
    interval: parseInt(document.getElementById("f-interval").value || "100", 10),
    delay: parseInt(document.getElementById("f-delay").value || "0", 10),
    multiplier: document.getElementById("f-multiplier").checked,
    audioName: document.getElementById("f-audio-name").value,
    audioVolume: parseInt(document.getElementById("f-audio-volume").value || "100", 10),
  };

  if (editingTriggerId) {
    const t = p.triggers.find(x => x.id === editingTriggerId);
    Object.assign(t, data);
  } else {
    data.id = uid();
    p.triggers.push(data);
  }

  saveState(state);
  connectTikFinity(); // garante conexão com o TikFinity usando a lista de ações atualizada
  closeTriggerModal();
  renderEditor();
  toast("Gatilho salvo");
}

/* ---------------- Modal: Selecionar áudio ---------------- */

// Áudios de exemplo — coloque os arquivos reais em assets/audio/public/
const SAMPLE_AUDIO = [
  { name: "10-second-intro-music.mp3", dur: "00:10.056" },
  { name: "5-second-countdown.mp3", dur: "00:05.042" },
  { name: "angel-choirrr.mp3", dur: "00:08.088" },
  { name: "angels-singing.mp3", dur: "00:05.400" },
  { name: "arrow-effect.mp3", dur: "00:00.720" },
  { name: "asian-gong-music.mp3", dur: "00:09.012" },
];

function openAudioModal(fromTriggerModal) {
  pendingAudioTarget = fromTriggerModal ? "trigger-form" : null;
  document.getElementById("modal-audio").classList.add("active");
  renderAudioList("");
}
function closeAudioModal() {
  document.getElementById("modal-audio").classList.remove("active");
}
function renderAudioList(filter) {
  const f = filter.trim().toLowerCase();
  const list = SAMPLE_AUDIO.filter(a => a.name.toLowerCase().includes(f));
  document.getElementById("audio-list").innerHTML = list.map(a => `
    <div class="audio-row">
      <button class="play-dot" onclick="event.stopPropagation()">▶</button>
      <div class="name">${a.name}</div>
      <div class="dur">${a.dur}</div>
      <button class="btn btn-primary btn-sm" onclick="selectAudio('${a.name}')">Selecionar</button>
    </div>`).join("") || `<div class="help-text">Nenhum áudio encontrado. Coloque arquivos em assets/audio/public/.</div>`;
}
function selectAudio(name) {
  if (pendingAudioTarget === "trigger-form") {
    document.getElementById("f-audio-name").value = name;
  }
  closeAudioModal();
  toast(`Áudio "${name}" selecionado`);
}

/* ---------------- Overlays ---------------- */

function renderOverlaysView() {
  // Garante que sempre exista um preset "selecionado" pro overlay (padrão: o ativo, senão o primeiro)
  if (!state.presets.some(p => p.id === state.overlayPresetId)) {
    state.overlayPresetId = state.activePresetId && state.presets.some(p => p.id === state.activePresetId)
      ? state.activePresetId
      : (state.presets[0] ? state.presets[0].id : null);
  }

  const p = state.presets.find(x => x.id === state.overlayPresetId) || null;

  const stage = document.getElementById("overlay-stage");
  const actionTypesForStage = p && (typeof getActionsForPreset === "function") ? getActionsForPreset(p) : ACTION_TYPES;
  const stageTriggers = p ? p.triggers.slice(0, 8) : [];

  if (stageTriggers.length === 0) {
    stage.innerHTML = `<div style="color: var(--text-dim); font-size:13px; padding:20px;">
      ${p ? "Este preset ainda não tem gatilhos configurados." : "Nenhum preset selecionado."}
    </div>`;
  } else {
    stage.innerHTML = stageTriggers.map(t => {
      const action = actionTypesForStage.find(a => a.id === t.actionId) || actionTypesForStage[0];
      const evt = EVENT_TYPES.find(e => e.id === t.eventId) || EVENT_TYPES[0];
      const iconPath = isExclusiveGame(p.gameId)
        ? exclusiveActionIconPath(p.gameId, action.id)
        : actionIconPath(p.gameId, action.id);
      return `
        <div class="fx">
          <div class="count">${t.count || 1}x</div>
          <img src="${iconPath}" alt="${action.label}" class="fx-img"
               onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='block'; this.nextElementSibling.nextElementSibling.style.display='none';">
          <div class="cue" style="display:none">${action.icon}</div>
          <div class="cue" style="font-size:13px; font-weight:600;">${action.label}</div>
          <div class="evt-icon" style="font-size:16px; margin-top:2px;" title="${evt.label}">${evt.icon}</div>
        </div>`;
    }).join("");
  }

  renderOverlayPresetChips(p);
  renderOverlayPresetCard(p);
}

// Chamado quando o usuário troca o preset nos "chips" da aba Overlays.
// A partir daqui, os gatilhos desse preset é que valem para o TikFinity.
function selectOverlayPreset(id) {
  state.overlayPresetId = id || null;
  state.activePresetId = id || null; // TikFinity/eventos usam o preset ativo
  saveState(state);
  renderOverlaysView();
}

// Chips com os presets do usuário (ex.: "TheEscapists2", "7DaysToDie")
function renderOverlayPresetChips(p) {
  const wrap = document.getElementById("overlay-preset-chips");
  if (!wrap) return;

  if (state.presets.length === 0) {
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = state.presets.map(pr => {
    const game = gameById(pr.gameId);
    const active = p && pr.id === p.id;
    return `
      <button class="preset-chip ${active ? "active" : ""}" onclick="selectOverlayPreset('${pr.id}')">
        ${imgWithFallback(gameCoverPath(pr.gameId), game.name, "chip-thumb")}
        <span>${pr.name}</span>
      </button>`;
  }).join("");
}

// Card do preset selecionado: cabeçalho (ativar/desativar, Stop/Start Events,
// Edit Preset, recolher) + lista compacta de gatilhos, no formato de referência.
function renderOverlayPresetCard(p) {
  const wrap = document.getElementById("overlay-preset-card");
  if (!wrap) return;

  if (!p) {
    wrap.innerHTML = `<div class="empty-state">
      Nenhum preset criado ainda. Vá até a aba "My Presets" e escolha um jogo para criar o primeiro.
    </div>`;
    return;
  }

  const game = gameById(p.gameId);
  const actionTypes = (typeof getActionsForPreset === "function") ? getActionsForPreset(p) : ACTION_TYPES;
  const collapsed = !!state.overlayCardCollapsed;
  const running = state.overlayEventsRunning !== false;
  const overLimit = p.triggers.length > MAX_TRIGGERS;

  wrap.innerHTML = `
    <div class="ov-card">
      <div class="ov-card-head">
        <div class="left">
          <input type="checkbox" ${state.overlayPresetEnabled === false ? "" : "checked"}
                 onchange="toggleOverlayPresetEnabled(this.checked)">
          ${imgWithFallback(gameCoverPath(p.gameId), game.name, "ov-card-thumb")}
          <span class="name">${p.name}</span>
        </div>
        <div class="right">
          <button class="btn btn-ghost btn-sm" onclick="toggleOverlayEventsRunning()">${running ? "Stop Events" : "Start Events"}</button>
          <button class="btn btn-ghost btn-sm" onclick="openEditor('${p.id}')">✏️ Edit Preset</button>
          <button class="btn btn-ghost btn-icon btn-sm" title="${collapsed ? "Expandir" : "Recolher"}" onclick="toggleOverlayCardCollapsed()">${collapsed ? "▾" : "▴"}</button>
        </div>
      </div>
      ${overLimit ? `<div class="ov-limit-warn">O número de eventos no preset excede o limite disponível da sua conta. ${p.triggers.length}/${MAX_TRIGGERS}</div>` : ""}
      ${collapsed ? "" : `
        <div class="ov-trigger-list">
          ${(!p.triggers || p.triggers.length === 0)
            ? `<div class="empty-state">Este preset ainda não tem gatilhos configurados. Edite-o para adicionar.</div>`
            : p.triggers.map((t, idx) => renderOverlayTriggerRow(p, t, idx, p.triggers.length, actionTypes)).join("")}
        </div>`}
    </div>`;
}

// Linha compacta de um gatilho dentro do card de Overlays (evento → ação),
// no formato: setas de reordenar | ícone/tipo do evento | ícone/label da ação | ativar | testar.
function renderOverlayTriggerRow(p, t, idx, total, actionTypes) {
  const evt = EVENT_TYPES.find(e => e.id === t.eventId) || EVENT_TYPES[0];
  const action = actionTypes.find(a => a.id === t.actionId) || actionTypes[0];
  const gift = t.giftId ? GIFT_CATALOG.find(g => g.id === t.giftId) : null;
  const iconPath = actionIconPath(p.gameId, action.id);

  let countLine = "";
  if (evt.id === "gift") {
    countLine = `${gift ? gift.fallback : "🎁"} ${t.count || 1}`;
  } else if (evt.needsCount) {
    countLine = `${t.count || 1} Likes`;
  } else if (evt.needsText) {
    countLine = t.text || "";
  }

  return `
    <div class="ov-trigger">
      <div class="reorder">
        <button ${idx === 0 ? "disabled" : ""} onclick="moveTrigger('${t.id}', -1); renderOverlayPresetCard(state.presets.find(x => x.id === state.overlayPresetId))">▲</button>
        <button ${idx === total - 1 ? "disabled" : ""} onclick="moveTrigger('${t.id}', 1); renderOverlayPresetCard(state.presets.find(x => x.id === state.overlayPresetId))">▼</button>
      </div>
      <div class="evt-icon">${evt.icon}</div>
      <div class="evt-info">
        <div class="who">Anyone</div>
        <div class="kind">${evt.icon} ${evt.label}</div>
        ${countLine ? `<div class="count-line">${countLine}</div>` : ""}
      </div>
      <div class="act-thumb">
        <img src="${iconPath}" alt="${action.label}" onerror="this.onerror=null; this.style.display='none'; this.nextElementSibling.style.display='flex';">
        <span style="display:none; align-items:center; justify-content:center; width:100%; height:100%; font-size:18px;">${action.icon}</span>
      </div>
      <div class="act-label">${t.count || 1}x ${action.label}</div>
      <label class="ov-enable" title="Ativar/desativar este gatilho">
        <input type="checkbox" ${t.enabled === false ? "" : "checked"} onchange="toggleTriggerEnabled('${t.id}', this.checked)">
      </label>
      <div class="mini-arrows">
        <button title="Editar" onclick="editTrigger('${t.id}')">‹</button>
        <button title="Duplicar" onclick="duplicateTrigger('${t.id}')">›</button>
      </div>
      <button class="play-btn" title="Testar" onclick="testTrigger('${t.id}')">▶</button>
    </div>`;
}

function toggleOverlayCardCollapsed() {
  state.overlayCardCollapsed = !state.overlayCardCollapsed;
  saveState(state);
  renderOverlayPresetCard(state.presets.find(x => x.id === state.overlayPresetId));
}

function toggleOverlayEventsRunning() {
  state.overlayEventsRunning = state.overlayEventsRunning === false ? true : false;
  saveState(state);
  toast(state.overlayEventsRunning === false ? "Eventos parados" : "Eventos ativados");
  renderOverlayPresetCard(state.presets.find(x => x.id === state.overlayPresetId));
}

function toggleOverlayPresetEnabled(checked) {
  state.overlayPresetEnabled = checked;
  saveState(state);
}

function toggleTriggerEnabled(id, checked) {
  const p = state.presets.find(x => x.id === state.overlayPresetId);
  if (!p) return;
  const t = p.triggers.find(x => x.id === id);
  if (!t) return;
  t.enabled = checked;
  saveState(state);
}

// Gera uma imagem PNG do preview do overlay (stage) e baixa no computador do usuário.
function saveOverlayStageImage() {
  const stage = document.getElementById("overlay-stage");
  if (!stage) return;

  if (typeof html2canvas === "undefined") {
    toast("Não foi possível gerar a imagem (biblioteca não carregou). Verifique sua conexão.");
    return;
  }

  const bgColor = getComputedStyle(document.body).getPropertyValue("--panel-2").trim() || "#1e222b";

  html2canvas(stage, { backgroundColor: bgColor, scale: 2, useCORS: true }).then(canvas => {
    let dataUrl;
    try {
      dataUrl = canvas.toDataURL("image/png");
    } catch (err) {
      showTaintedCanvasWarning();
      return;
    }
    const link = document.createElement("a");
    link.download = `overlay-${(state.presets.find(p => p.id === state.overlayPresetId) || {}).name || "preview"}.png`;
    link.href = dataUrl;
    link.click();
    toast("🖼️ Imagem salva");
  }).catch(() => {
    showTaintedCanvasWarning();
  });
}

// Chrome/Edge bloqueiam a exportação do canvas quando o painel é aberto
// direto como arquivo local (file://) e alguma imagem (ex.: o PNG do Pipa)
// é carregada de outra "origem" do ponto de vista do navegador.
// Isso não acontece quando o painel está hospedado num servidor (http/https).
function showTaintedCanvasWarning() {
  alert(
    "Não foi possível gerar a imagem.\n\n" +
    "Isso acontece quando o painel é aberto direto como arquivo local (file://) " +
    "— o navegador bloqueia a exportação do canvas por segurança quando há uma " +
    "imagem PNG customizada (ex.: ícone do Pipa) no meio.\n\n" +
    "Solução: rode o painel por um servidor local (ex.: http://localhost) ou " +
    "hospede-o num domínio (http/https). Assim que não estiver mais em file://, " +
    "o botão \"Salvar imagem\" volta a funcionar normalmente, mesmo com PNGs."
  );
}

function copyPresetId() {
  const p = activePreset();
  if (!p) return;
  navigator.clipboard?.writeText(p.id);
  toast("ID copiado");
}

/* ---------------- Toast ---------------- */

let toastTimer = null;
function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------------- Boot ---------------- */

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".nav button[data-view]").forEach(btn => {
    btn.addEventListener("click", () => {
      if (document.body.classList.contains("locked")) return; // painel travado até verificar
      showView(btn.dataset.view);
    });
  });
  showView("presets");
  initAuth();
});


/* ============================================================
   AUTENTICAÇÃO / SUPABASE — verificação de e-mail e licenças
   Tabelas usadas (mesmo banco do painel antigo):
     - configuracoes_jogos: catálogo dos jogos exclusivos (is_free, preco,
       descricao, link_youtube, capa_url, servidor_url)
     - acessos_jogos: e-mail -> jogo_id -> expira_em (licença comprada)
   ============================================================ */

// Mesma regra usada no painel antigo para decidir se um jogo é premium
function checkIsPremium(config) {
  if (config.is_free === true || config.is_free === 1 || String(config.is_free).toLowerCase() === "true") {
    return false; // é free
  }
  return true; // premium
}

// Carrega o catálogo de jogos exclusivos do Supabase (configuracoes_jogos)
// A aba "Exclusivos" mostra SOMENTE o que vier desta consulta — sem fallback
// fixo no código. Se o Supabase estiver fora do ar ou não retornar nada,
// a grade fica vazia (mensagem "Nenhum jogo exclusivo encontrado").
async function carregarJogosExclusivos() {
  if (!_supabase) {
    console.error("Supabase indisponível: aba Exclusivos ficará vazia.");
    exclusiveGamesCache = [];
    return;
  }
  try {
    const { data: jogos, error } = await _supabase.from("configuracoes_jogos").select("*");
    if (error) throw error;

    exclusiveGamesCache = (jogos || []).map(j => ({
      id: j.jogo_id,
      name: String(j.jogo_id || "").replace(/_/g, " "),
      isPremium: checkIsPremium(j),
      price: j.preco || "0.00",
      descricao: j.descricao || "",
      trailer: j.link_youtube || "",
      capaUrl: j.capa_url || "",
      servidorUrl: j.servidor_url || "",
      badge: String(j.jogo_id).toLowerCase() === "pipa_interativa" ? "destaque" : "novo",
    }));
  } catch (e) {
    console.error("Erro ao carregar jogos exclusivos do Supabase:", e);
    exclusiveGamesCache = [];
  }
}

// Verifica, para o e-mail digitado, quais licenças estão ativas
async function verificarAcesso() {
  const emailInput = document.getElementById("global-email");
  const msg = document.getElementById("auth-msg");
  const email = emailInput.value.trim().toLowerCase();

  if (!email) {
    msg.style.color = "var(--danger)";
    msg.textContent = "Digite um e-mail!";
    return;
  }

  msg.style.color = "var(--warn)";
  msg.textContent = "Verificando...";

  try {
    if (!_supabase) throw new Error("Supabase indisponível");

    const { data: acessos, error } = await _supabase
      .from("acessos_jogos")
      .select("jogo_id, expira_em")
      .eq("email", email);

    if (error) throw error;

    // "Verificado" exige que o e-mail tenha pelo menos 1 registro cadastrado
    // em acessos_jogos (mesmo que a licença já tenha expirado). Um e-mail
    // sem nenhum registro NÃO libera o painel.
    if (!acessos || acessos.length === 0) {
      isVerified = false;
      userEmail = "";
      licencasLiberadas = [];
      localStorage.removeItem("global_user_email");
      msg.style.color = "var(--danger)";
      msg.textContent = "E-mail não encontrado. Verifique o e-mail digitado ou adquira acesso.";
      lockPanel();
      renderExclusivosGrid("");
      renderSidebarGamesList("");
      return;
    }

    licencasLiberadas = [];
    const now = new Date();
    acessos.forEach(a => {
      if (new Date(a.expira_em) > now) {
        licencasLiberadas.push(String(a.jogo_id).toLowerCase().trim());
      }
    });

    userEmail = email;
    isVerified = true;
    localStorage.setItem("global_user_email", email);

    msg.style.color = "var(--accent-2)";
    msg.textContent = "Acesso liberado!";
    document.getElementById("btn-switch-account").style.display = "inline-flex";
    unlockPanel();
  } catch (e) {
    console.error("Erro ao verificar acesso:", e);
    isVerified = false;
    msg.style.color = "var(--danger)";
    msg.textContent = "Erro ao verificar. Tente novamente.";
  }

  renderExclusivosGrid("");
  renderSidebarGamesList("");
}

function trocarConta() {
  isVerified = false;
  userEmail = "";
  licencasLiberadas = [];
  localStorage.removeItem("global_user_email");
  document.getElementById("global-email").value = "";
  document.getElementById("auth-msg").textContent = "";
  document.getElementById("btn-switch-account").style.display = "none";
  lockPanel();
  renderSidebarGamesList("");
}

function unlockPanel() {
  document.body.classList.remove("locked");
  document.getElementById("lock-status").textContent = "";
}

function lockPanel() {
  document.body.classList.add("locked");
  document.getElementById("global-email").focus();
}

// Roda no carregamento da página: tenta reaproveitar e-mail salvo
async function initAuth() {
  const savedEmail = localStorage.getItem("global_user_email") || "";
  if (savedEmail) {
    document.getElementById("global-email").value = savedEmail;
  }

  await carregarJogosExclusivos();
  renderExclusivosGrid("");
  renderSidebarGamesList("");

  if (savedEmail) {
    await verificarAcesso();
  }
}

/* ============================================================
   JOGOS EXCLUSIVOS — grid com badge de licença (Premium/Free)
   ============================================================ */

const BADGE_LABELS = {
  novo:      "🆕 Novo",
  beta:      "🔬 Beta",
  "em-breve":"🔜 Em Breve",
  destaque:  "🔥 Destaque",
};

function renderExclusivosGrid(filter) {
  const grid = document.getElementById("exclusivos-grid");
  if (!grid) return;
  const f = (filter || "").trim().toLowerCase();
  const list = exclusiveGamesCache.filter(g => g.name.toLowerCase().includes(f));

  if (list.length === 0) {
    grid.innerHTML = `<div class="help-text" style="grid-column:1/-1;text-align:center;padding:40px 0;">Nenhum jogo exclusivo encontrado.</div>`;
    return;
  }

  grid.innerHTML = list.map(g => {
    const badge = g.badge || "novo";
    const label = BADGE_LABELS[badge] || "🆕 Novo";
    const coverSrc = g.capaUrl || exclusiveCoverPath(g.id);

    const temAcesso = !g.isPremium || licencasLiberadas.includes(String(g.id).toLowerCase().trim());
    const locked = !!g.isPremium && !temAcesso;

    let statusHtml;
    if (!g.isPremium) {
      statusHtml = `<div class="license-status free">✓ Acesso Livre</div>`;
    } else if (!isVerified) {
      statusHtml = `<div class="license-status pending">Verifique seu e-mail</div>`;
    } else if (temAcesso) {
      statusHtml = `<div class="license-status active">✓ Licença Ativa</div>`;
    } else {
      statusHtml = `<div class="license-status blocked">✕ Sem Licença</div>`;
    }

    return `
      <div class="game-tile exclusive-tile ${locked ? "locked" : ""}"
           onclick="handleExclusiveClick('${g.id}', ${locked})">
        <div class="exclusive-badge ${badge}">${label}</div>
        ${g.isPremium ? `<div class="price-badge">$ ${g.price}</div>` : ""}
        ${imgWithFallback(coverSrc, g.name)}
        <div class="label">${g.name}</div>
        ${statusHtml}
        ${g.trailer ? `<a href="${g.trailer}" target="_blank" class="trailer-link" onclick="event.stopPropagation()">▶ Trailer</a>` : ""}
      </div>`;
  }).join("");
}

/* ---------------- VIEW: GAMES (catálogo geral) ---------------- */

function renderGamesGrid(filter) {
  const grid = document.getElementById("all-games-grid");
  if (!grid) return;
  const f = (filter || "").trim().toLowerCase();

  const list = GAMES.filter(g => g.name.toLowerCase().includes(f));

  if (list.length === 0) {
    grid.innerHTML = `<div class="help-text" style="grid-column:1/-1;text-align:center;padding:40px 0;">Nenhum jogo encontrado.</div>`;
    return;
  }

  grid.innerHTML = list.map(g => `
    <div class="game-tile" onclick="createPresetForGame('${g.id}')">
      ${imgWithFallback(gameCoverPath(g.id), g.name)}
      <div class="label">${g.name}</div>
    </div>`
  ).join("");
}

// Clique em um jogo exclusivo: bloqueia com aviso se não houver licença ativa
function handleExclusiveClick(gameId, locked) {
  if (locked) {
    const game = exclusiveGamesCache.find(g => g.id === gameId);
    const nome = game ? game.name : gameId;
    const preco = game ? game.price : "0.00";
    toast(`🔒 Sem licença ativa para "${nome}" (US$ ${preco}). Verifique seu e-mail ou adquira o acesso.`);
    return;
  }
  createPresetForGame(gameId);
}

/* ============================================================
   PIPA INTERATIVA — integração com o painel
   ============================================================ */

// Cobre também a capa de jogos exclusivos (Supabase) no editor de preset,
// já que o `gameCoverPath` original só conhece os jogos de `GAMES`.
const _origGameCoverPath = gameCoverPath;
window.gameCoverPath = function(gameId) {
  const exclusiveGame = exclusiveGamesCache.find(g => g.id === gameId);
  if (exclusiveGame) return exclusiveGame.capaUrl || exclusiveCoverPath(gameId);
  return _origGameCoverPath(gameId);
};

// jogo_id cadastrado no Supabase (tabela configuracoes_jogos) para o Pipa Interativa
const PIPA_GAME_ID = "pipa_interativa";
// Cópia local do jogo, já com a integração TikFinity + postMessage deste pacote
const PIPA_GAME_LOCAL_PATH = "mods-exclusivos/pipa_interativa/index.html";
// URL pública do jogo (só é usada se não existir cópia local nem servidor_url no Supabase)
const PIPA_GAME_FALLBACK_URL = "https://a3ndrecampos-create.github.io/fedddddddddddserrrrrrs/";

// jogo_id cadastrado no Supabase (tabela configuracoes_jogos) para o Street Fighter Interativo
const SF_GAME_ID = "street_fighter_interativo";
// Cópia local do jogo (modo CPU vs CPU / Rei da Colina), controlado via
// BroadcastChannel "cpu_vs_cpu_panel" (mesmo canal que o ai-mod.js do jogo escuta).
const SF_GAME_LOCAL_PATH = "mods-exclusivos/street_fighter_interativo/index.htm";
const SF_CHANNEL_NAME = "cpu_vs_cpu_panel";

// jogo_id cadastrado no Supabase (tabela configuracoes_jogos) para o Squid Run
const SQUID_GAME_ID = "batatinha_123";
// Cópia local do jogo, controlado via postMessage (mesmo protocolo do Pipa
// Interativa) — ver comentário completo em SQUID_ACTION_TYPES (js/data.js).
const SQUID_GAME_LOCAL_PATH = "mods-exclusivos/batatinha_123/index.html";

// jogo_id cadastrado no Supabase (tabela configuracoes_jogos) para o Puxa Truck
const TRUCK_GAME_ID = "puxa_truck";
// Cópia local do jogo, controlado via postMessage (mesmo protocolo do Pipa
// Interativa e do Squid Run) — ver comentário completo em TRUCK_ACTION_TYPES (js/data.js).
const TRUCK_GAME_LOCAL_PATH = "mods-exclusivos/puxa_truck/index.html";

// jogo_id cadastrado no Supabase (tabela configuracoes_jogos) para o Blade Arena
const BLADE_GAME_ID = "blade_arena_4_player";
// Cópia local do jogo, controlado via postMessage (mesmo protocolo dos demais
// jogos exclusivos) — ver comentário completo em BLADE_ACTION_TYPES (js/data.js).
const BLADE_GAME_LOCAL_PATH = "mods-exclusivos/blade_arena_4_player/index.html";

// Jogos exclusivos que vêm embutidos no próprio pacote do painel (pasta
// mods-exclusivos/<id>/...) e por isso não dependem de `servidor_url` do
// Supabase para abrir — o botão "Abrir Jogo" sempre usa essa cópia local.
const LOCAL_EXCLUSIVE_GAMES = {
  [PIPA_GAME_ID]: PIPA_GAME_LOCAL_PATH,
  [SF_GAME_ID]: SF_GAME_LOCAL_PATH,
  [SQUID_GAME_ID]: SQUID_GAME_LOCAL_PATH,
  [TRUCK_GAME_ID]: TRUCK_GAME_LOCAL_PATH,
  [BLADE_GAME_ID]: BLADE_GAME_LOCAL_PATH,
};

// Detecta se um jogo (por id) é um jogo exclusivo (não precisa instalar mod)
function isExclusiveGame(gameId) {
  if (!gameId) return false;
  if (gameId === PIPA_GAME_ID) return true;
  if (LOCAL_EXCLUSIVE_GAMES[gameId]) return true;
  return exclusiveGamesCache.some(g => g.id === gameId);
}

// Detecta se o preset ativo é do Pipa Interativa
function isPipaPreset(preset) {
  return preset && preset.gameId === PIPA_GAME_ID;
}

// Detecta se o preset ativo é do Street Fighter Interativo
function isSfPreset(preset) {
  return preset && preset.gameId === SF_GAME_ID;
}

// Detecta se o preset ativo é do Squid Run
function isSquidPreset(preset) {
  return preset && preset.gameId === SQUID_GAME_ID;
}

// Detecta se o preset ativo é do Puxa Truck
function isTruckPreset(preset) {
  return preset && preset.gameId === TRUCK_GAME_ID;
}

// Detecta se o preset ativo é do Blade Arena
function isBladePreset(preset) {
  return preset && preset.gameId === BLADE_GAME_ID;
}

// Jogos exclusivos com sua própria lista de ações (controlados pelos
// gatilhos do painel, diferente de um jogo comum com mod instalado)
function isCustomActionGame(preset) {
  return isPipaPreset(preset) || isSfPreset(preset) || isSquidPreset(preset) || isTruckPreset(preset) || isBladePreset(preset);
}

// Retorna as ações corretas conforme o jogo do preset
function getActionsForPreset(preset) {
  if (isPipaPreset(preset)) return PIPA_ACTION_TYPES;
  if (isSfPreset(preset)) return SF_ACTION_TYPES;
  if (isSquidPreset(preset)) return SQUID_ACTION_TYPES;
  if (isTruckPreset(preset)) return TRUCK_ACTION_TYPES;
  if (isBladePreset(preset)) return BLADE_ACTION_TYPES;
  return ACTION_TYPES;
}

/* ----------- Override do modal de gatilho para injetar ações do Pipas ----------- */
const _origOpenTriggerModal = openTriggerModal;
openTriggerModal = function(triggerId) {
  const p = activePreset();
  const actions = getActionsForPreset(p);

  // Temporariamente substituir ACTION_TYPES pelo correto
  const actSelect = document.getElementById("f-action");

  _origOpenTriggerModal(triggerId);

  // Repopular o select de ações com as do jogo correto
  const t = triggerId ? p.triggers.find(x => x.id === triggerId) : null;
  actSelect.innerHTML = actions.map(a =>
    `<option value="${a.id}">${a.icon} ${a.label}</option>`
  ).join("");
  if (t) actSelect.value = t.actionId;
};

// Caminho do PNG customizado de cada evento de um jogo exclusivo com ações
// próprias (se existir) — ex.: assets/games-exclusive/pipa_interativa/eventos/spawn_random.png
function exclusiveActionIconPath(gameId, actionId) {
  return `assets/games-exclusive/${gameId}/eventos/${String(actionId).toLowerCase()}.png`;
}
// Mantido por compatibilidade (usado em outros pontos do código)
function pipaActionIconPath(actionId) {
  return exclusiveActionIconPath(PIPA_GAME_ID, actionId);
}

/* ----------- Override do renderTriggerRow para mostrar ações corretas ----------- */
const _origRenderTriggerRow = renderTriggerRow;
window.renderTriggerRow = function(t, idx, total) {
  const p = activePreset();
  if (!isCustomActionGame(p)) return _origRenderTriggerRow(t, idx, total);

  const actionsList = getActionsForPreset(p);
  const evt = EVENT_TYPES.find(e => e.id === t.eventId) || EVENT_TYPES[0];
  const action = actionsList.find(a => a.id === t.actionId) || actionsList[0];
  const gift = t.giftId ? GIFT_CATALOG.find(g => g.id === t.giftId) : null;
  const testFn = isPipaPreset(p) ? "testPipaTrigger"
    : isSquidPreset(p) ? "testSquidTrigger"
    : isTruckPreset(p) ? "testTruckTrigger"
    : isBladePreset(p) ? "testBladeTrigger"
    : "testSfTrigger";

  let extraLine = "";
  if (evt.id === "gift") {
    extraLine = `<div class="extra">${gift ? gift.fallback : "🎁"} ${t.count || 1} ${gift ? gift.label : "(sem presente)"}</div>`;
  } else if (evt.needsCount) {
    extraLine = `<div class="extra">${t.count || 1} Likes</div>`;
  } else if (evt.needsText) {
    extraLine = `<div class="extra">${t.text || ""}</div>`;
  }

  const command = action.template || action.id;

  return `
    <div class="trigger">
      <div class="reorder">
        <button ${idx === 0 ? "disabled" : ""} onclick="moveTrigger('${t.id}', -1)">▲</button>
        <button ${idx === total - 1 ? "disabled" : ""} onclick="moveTrigger('${t.id}', 1)">▼</button>
      </div>
      <div class="event">
        <div class="who">Anyone</div>
        <div class="kind">${evt.icon} ${evt.label}</div>
        ${extraLine}
      </div>
      <div class="action-icon">
        <img src="${exclusiveActionIconPath(p.gameId, action.id)}" alt="${action.label}" style="width:100%;height:100%;object-fit:contain;"
             onerror="this.style.display='none'; this.nextElementSibling.style.display='inline';">
        <span style="display:none">${action.icon}</span>
      </div>
      <div class="action">
        <div class="name">${action.label}</div>
        <div class="details">
          <span>Repetição: <b>${t.repetition || 1}</b></span>
          <span>Intervalo: <b>${t.interval || 100}</b></span>
          <span>Delay: <b>${t.delay || 0}</b></span>
          <span class="link" onclick="editTrigger('${t.id}')">${command}</span>
        </div>
      </div>
      <div class="audio">
        <div class="name">${t.audioName || "Nenhum áudio"}</div>
        <div class="vol">Volume: ${t.audioVolume ?? 100}%</div>
      </div>
      <div class="actions">
        <button class="btn btn-primary btn-icon btn-sm" title="Testar" onclick="${testFn}('${t.id}')">▶</button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Editar" onclick="editTrigger('${t.id}')">✏️</button>
        <button class="btn btn-ghost btn-icon btn-sm" title="Duplicar" onclick="duplicateTrigger('${t.id}')">📋</button>
        <button class="btn btn-danger btn-icon btn-sm" title="Excluir" onclick="deleteTrigger('${t.id}')">🗑️</button>
      </div>
    </div>`;
};

/* ----------- Conexão com o Pipa Interativa via postMessage ----------- */

let pipaGameWindow = null;

function openPipaGame() {
  // O Pipa Interativa é um jogo embutido no próprio pacote do painel
  // (mods-exclusivos/pipa_interativa/index.html) — sempre abrimos essa
  // cópia local, ignorando qualquer servidor_url vindo do Supabase.
  const url = PIPA_GAME_LOCAL_PATH;
  pipaGameWindow = window.open(url, "pipa-interativa",
    "width=900,height=800,resizable=yes,scrollbars=no");
  toast("🪁 Pipa Interativa aberto! Aguardando conexão…");
}

// Envia comando para o jogo
function sendPipaCommand(action, user, avatar) {
  if (!pipaGameWindow || pipaGameWindow.closed) {
    toast("⚠️ Jogo não está aberto. Abra o Pipa Interativa primeiro.");
    return;
  }
  pipaGameWindow.postMessage({ type: "PIPA_ACTION", action, user, avatar }, "*");
}

// Testar gatilho do Pipa Interativa
function testPipaTrigger(triggerId) {
  const p = activePreset();
  if (!p) return;
  const t = p.triggers.find(x => x.id === triggerId);
  if (!t) return;
  sendPipaCommand(t.actionId, "TESTE_PAINEL", "https://www.tiktok.com/favicon.ico");
  toast(`▶ Testando: ${t.actionId}`);
}

/* ----------- Conexão com o Street Fighter Interativo via BroadcastChannel ----------- */
// O jogo (ai-mod.js) já escuta o canal "cpu_vs_cpu_panel" esperando mensagens
// {type:"EXECUTE_ACTION", action, user, avatar}. Isso só funciona se o painel
// e o jogo estiverem na MESMA origem (ex.: ambos servidos por um servidor local/
// GitHub Pages) — BroadcastChannel não atravessa origens diferentes. Abrindo os
// arquivos direto com duplo-clique (file://) cada aba pode cair em uma origem
// isolada e a conexão não se estabelece; nesse caso, use o próprio painel de
// controle embutido no jogo (botão "⚙️ Conf." dentro dele).
let sfChannel = null;
let sfGameWindow = null;
let sfConnected = false;

function ensureSfChannel() {
  if (sfChannel || typeof BroadcastChannel === "undefined") return sfChannel;
  sfChannel = new BroadcastChannel(SF_CHANNEL_NAME);
  sfChannel.onmessage = (ev) => {
    const msg = ev.data;
    if (!msg || !msg.type) return;
    if (msg.type === "READY" || msg.type === "PONG") {
      sfConnected = true;
      const statusEl = document.getElementById("sf-conn-status");
      if (statusEl) {
        statusEl.textContent = "🟢 Jogo aberto e conectado";
        statusEl.style.color = "var(--accent-2)";
      }
    }
  };
  return sfChannel;
}

function openSfGame() {
  // O Street Fighter Interativo é um jogo embutido no próprio pacote do
  // painel (mods-exclusivos/street_fighter_interativo/index.htm).
  sfGameWindow = window.open(SF_GAME_LOCAL_PATH, "street-fighter-interativo",
    "width=900,height=700,resizable=yes,scrollbars=no");
  ensureSfChannel();
  sfConnected = false;
  toast("🥊 Street Fighter Interativo aberto! Aguardando conexão…");
}

// Envia comando para o jogo (mesma "forma" que o painel de controle embutido nele usa)
function sendSfCommand(action, user, avatar) {
  const ch = ensureSfChannel();
  if (!ch) {
    toast("⚠️ Seu navegador não suporta BroadcastChannel.");
    return;
  }
  ch.postMessage({ type: "EXECUTE_ACTION", action, user, avatar });
}

// Testar gatilho do Street Fighter Interativo
function testSfTrigger(triggerId) {
  const p = activePreset();
  if (!p) return;
  const t = p.triggers.find(x => x.id === triggerId);
  if (!t) return;
  sendSfCommand(t.actionId, "TESTE_PAINEL", "https://www.tiktok.com/favicon.ico");
  toast(`▶ Testando: ${t.actionId}`);
}

/* ----------- Conexão com o Squid Run via postMessage ----------- */
// O jogo (mods-exclusivos/batatinha_123/index.html) escuta
// window.addEventListener("message", ...) esperando
// {type:"SQUID_ACTION", action, user, avatar} e repassa para sua própria
// função executeAction(action, user, avatar) já existente no jogo.
// Observação: o Squid Run também tem uma conexão TikFinity PRÓPRIA
// embutida (ws://localhost:21213/), independente do painel — ver
// comentário completo em SQUID_ACTION_TYPES (js/data.js).

let squidGameWindow = null;

function openSquidGame() {
  // O Squid Run é um jogo embutido no próprio pacote do painel
  // (mods-exclusivos/batatinha_123/index.html) — sempre abrimos essa
  // cópia local, ignorando qualquer servidor_url vindo do Supabase.
  squidGameWindow = window.open(SQUID_GAME_LOCAL_PATH, "squid-run",
    "width=560,height=900,resizable=yes,scrollbars=no");
  toast("🥔 Squid Run aberto! Aguardando conexão…");
}

// Envia comando para o jogo
function sendSquidCommand(action, user, avatar) {
  if (!squidGameWindow || squidGameWindow.closed) {
    toast("⚠️ Jogo não está aberto. Abra o Squid Run primeiro.");
    return;
  }
  squidGameWindow.postMessage({ type: "SQUID_ACTION", action, user, avatar }, "*");
}

// Testar gatilho do Squid Run
function testSquidTrigger(triggerId) {
  const p = activePreset();
  if (!p) return;
  const t = p.triggers.find(x => x.id === triggerId);
  if (!t) return;
  sendSquidCommand(t.actionId, "TESTE_PAINEL", "https://www.tiktok.com/favicon.ico");
  toast(`▶ Testando: ${t.actionId}`);
}

/* ----------- Conexão com o Puxa Truck via postMessage ----------- */
// O jogo (mods-exclusivos/puxa_truck/index.html) escuta
// window.addEventListener("message", ...) esperando
// {type:"TRUCK_ACTION", action:"FORCA_ROSA_3", user, avatar} e repassa
// para sua própria função addForce(team, força) já existente no jogo.
// Observação: o Puxa Truck também tem uma conexão TikFinity PRÓPRIA
// embutida (ws://localhost:21213/), independente do painel — ver
// comentário completo em TRUCK_ACTION_TYPES (js/data.js).

let truckGameWindow = null;

function openTruckGame() {
  // O Puxa Truck é um jogo embutido no próprio pacote do painel
  // (mods-exclusivos/puxa_truck/index.html) — sempre abrimos essa
  // cópia local, ignorando qualquer servidor_url vindo do Supabase.
  truckGameWindow = window.open(TRUCK_GAME_LOCAL_PATH, "puxa-truck",
    "width=900,height=700,resizable=yes,scrollbars=no");
  toast("🚛 Puxa Truck aberto! Aguardando conexão…");
}

// Envia comando para o jogo
function sendTruckCommand(action, user, avatar) {
  if (!truckGameWindow || truckGameWindow.closed) {
    toast("⚠️ Jogo não está aberto. Abra o Puxa Truck primeiro.");
    return;
  }
  truckGameWindow.postMessage({ type: "TRUCK_ACTION", action, user, avatar }, "*");
}

// Testar gatilho do Puxa Truck
function testTruckTrigger(triggerId) {
  const p = activePreset();
  if (!p) return;
  const t = p.triggers.find(x => x.id === triggerId);
  if (!t) return;
  sendTruckCommand(t.actionId, "TESTE_PAINEL", "https://www.tiktok.com/favicon.ico");
  toast(`▶ Testando: ${t.actionId}`);
}

/* ----------- Conexão com o Blade Arena via postMessage ----------- */
// O jogo (mods-exclusivos/blade_arena_4_player/index.html) escuta
// window.addEventListener("message", ...) esperando
// {type:"BLADE_ACTION", action, user, avatar} e repassa para sua própria
// função executeAction(action, player) já existente no jogo (spawnando
// ou enfileirando o jogador automaticamente se necessário).
// Observação: o Blade Arena também tem uma conexão TikFinity PRÓPRIA
// embutida (ws://localhost:21213/), independente do painel — ver
// comentário completo em BLADE_ACTION_TYPES (js/data.js).

let bladeGameWindow = null;

function openBladeGame() {
  // O Blade Arena é um jogo embutido no próprio pacote do painel
  // (mods-exclusivos/blade_arena_4_player/index.html) — sempre abrimos
  // essa cópia local, ignorando qualquer servidor_url vindo do Supabase.
  bladeGameWindow = window.open(BLADE_GAME_LOCAL_PATH, "blade-arena",
    "width=900,height=700,resizable=yes,scrollbars=no");
  toast("⚔️ Blade Arena aberto! Aguardando conexão…");
}

// Envia comando para o jogo
function sendBladeCommand(action, user, avatar) {
  if (!bladeGameWindow || bladeGameWindow.closed) {
    toast("⚠️ Jogo não está aberto. Abra o Blade Arena primeiro.");
    return;
  }
  bladeGameWindow.postMessage({ type: "BLADE_ACTION", action, user, avatar }, "*");
}

// Testar gatilho do Blade Arena
function testBladeTrigger(triggerId) {
  const p = activePreset();
  if (!p) return;
  const t = p.triggers.find(x => x.id === triggerId);
  if (!t) return;
  sendBladeCommand(t.actionId, "TESTE_PAINEL", "https://www.tiktok.com/favicon.ico");
  toast(`▶ Testando: ${t.actionId}`);
}

/* ----------- Renderizar editor: mod-box vira "Abrir Jogo" para jogos exclusivos ----------- */
let _modBoxDefaultHTML = null; // guarda o HTML original de "Instalação do Mod"

const _origRenderEditor = renderEditor;
window.renderEditor = function() {
  _origRenderEditor();
  const p = activePreset();
  const modBox = document.getElementById("mod-box");
  if (!modBox) return;

  if (_modBoxDefaultHTML === null) {
    _modBoxDefaultHTML = modBox.innerHTML; // primeira vez: guarda o mod-box original
  }

  const exclusive = isExclusiveGame(p ? p.gameId : null);

  if (!exclusive) {
    // Jogo comum: garante que o mod-box padrão (instalação de mod) esteja de volta
    if (modBox.dataset.mode !== "default") {
      modBox.innerHTML = _modBoxDefaultHTML;
      modBox.dataset.mode = "default";
    }
    return;
  }

  // Jogo exclusivo: não precisa instalar mod — só um botão de abrir o jogo
  const modeKey = "exclusive-" + p.gameId;
  if (modBox.dataset.mode !== modeKey) {
    if (isPipaPreset(p)) {
      modBox.innerHTML = `
        <div class="mod-title">Jogo Exclusivo</div>
        <button class="btn btn-green btn-sm btn-open-pipa" style="width:100%" onclick="openPipaGame()">🪁 Abrir Pipa Interativa</button>
        <div class="help-text" id="pipa-conn-status" style="margin-top:6px">Jogo fechado</div>
      `;
    } else if (isSfPreset(p)) {
      modBox.innerHTML = `
        <div class="mod-title">Jogo Exclusivo</div>
        <button class="btn btn-green btn-sm" style="width:100%" onclick="openSfGame()">🥊 Abrir Street Fighter Interativo</button>
        <div class="help-text" id="sf-conn-status" style="margin-top:6px">Jogo fechado</div>
        <div class="help-text" style="margin-top:4px">Dica: os gatilhos abaixo (golpe, cura, energia) só afetam quem já está lutando na tela.</div>
      `;
    } else if (isSquidPreset(p)) {
      modBox.innerHTML = `
        <div class="mod-title">Jogo Exclusivo</div>
        <button class="btn btn-green btn-sm" style="width:100%" onclick="openSquidGame()">🥔 Abrir Squid Run</button>
        <div class="help-text" id="squid-conn-status" style="margin-top:6px">Jogo fechado</div>
        <div class="help-text" style="margin-top:4px">Dica: o jogo também tem seu próprio painel interno de eventos TikFinity (botão ⚙️ dentro dele), independente destes gatilhos.</div>
      `;
    } else if (isTruckPreset(p)) {
      modBox.innerHTML = `
        <div class="mod-title">Jogo Exclusivo</div>
        <button class="btn btn-green btn-sm" style="width:100%" onclick="openTruckGame()">🚛 Abrir Puxa Truck</button>
        <div class="help-text" id="truck-conn-status" style="margin-top:6px">Jogo fechado</div>
        <div class="help-text" style="margin-top:4px">Dica: o jogo também tem seu próprio painel interno de eventos TikFinity (botão ⚙️ dentro dele), independente destes gatilhos.</div>
      `;
    } else if (isBladePreset(p)) {
      modBox.innerHTML = `
        <div class="mod-title">Jogo Exclusivo</div>
        <button class="btn btn-green btn-sm" style="width:100%" onclick="openBladeGame()">⚔️ Abrir Blade Arena</button>
        <div class="help-text" id="blade-conn-status" style="margin-top:6px">Jogo fechado</div>
        <div class="help-text" style="margin-top:4px">Dica: arena comporta só 4 lutadores por vez — o resto entra numa fila de espera dentro do próprio jogo. Ele também tem seu próprio painel interno de eventos TikFinity (botão ⚙️ dentro dele), independente destes gatilhos.</div>
      `;
    } else {
      const game = exclusiveGamesCache.find(g => g.id === p.gameId);
      const localPath = LOCAL_EXCLUSIVE_GAMES[p.gameId];
      const url = localPath || (game && game.servidorUrl);
      modBox.innerHTML = `
        <div class="mod-title">Jogo Exclusivo</div>
        <button class="btn btn-green btn-sm" style="width:100%"
          onclick="${url ? `window.open('${url}', '_blank')` : `toast('Link do jogo ainda não configurado.')`}">
          ▶ Abrir Jogo
        </button>
      `;
    }
    modBox.dataset.mode = modeKey;
  }

  // Atualiza status de conexão (Pipa Interativa usa postMessage)
  if (isPipaPreset(p)) {
    const statusEl = document.getElementById("pipa-conn-status");
    if (statusEl) {
      const aberto = pipaGameWindow && !pipaGameWindow.closed;
      statusEl.textContent = aberto ? "🟢 Jogo aberto e conectado" : "⚪ Jogo fechado";
      statusEl.style.color = aberto ? "var(--accent-2)" : "var(--text-dim)";
    }
  }

  // Atualiza status de conexão (Street Fighter Interativo usa BroadcastChannel)
  if (isSfPreset(p)) {
    const statusEl = document.getElementById("sf-conn-status");
    if (statusEl && !sfConnected) {
      const aberto = sfGameWindow && !sfGameWindow.closed;
      statusEl.textContent = aberto ? "⚪ Jogo aberto, aguardando conexão…" : "⚪ Jogo fechado";
      statusEl.style.color = "var(--text-dim)";
    }
  }

  // Atualiza status de conexão (Squid Run usa postMessage)
  if (isSquidPreset(p)) {
    const statusEl = document.getElementById("squid-conn-status");
    if (statusEl) {
      const aberto = squidGameWindow && !squidGameWindow.closed;
      statusEl.textContent = aberto ? "🟢 Jogo aberto e conectado" : "⚪ Jogo fechado";
      statusEl.style.color = aberto ? "var(--accent-2)" : "var(--text-dim)";
    }
  }

  // Atualiza status de conexão (Puxa Truck usa postMessage)
  if (isTruckPreset(p)) {
    const statusEl = document.getElementById("truck-conn-status");
    if (statusEl) {
      const aberto = truckGameWindow && !truckGameWindow.closed;
      statusEl.textContent = aberto ? "🟢 Jogo aberto e conectado" : "⚪ Jogo fechado";
      statusEl.style.color = aberto ? "var(--accent-2)" : "var(--text-dim)";
    }
  }

  // Atualiza status de conexão (Blade Arena usa postMessage)
  if (isBladePreset(p)) {
    const statusEl = document.getElementById("blade-conn-status");
    if (statusEl) {
      const aberto = bladeGameWindow && !bladeGameWindow.closed;
      statusEl.textContent = aberto ? "🟢 Jogo aberto e conectado" : "⚪ Jogo fechado";
      statusEl.style.color = aberto ? "var(--accent-2)" : "var(--text-dim)";
    }
  }
};

/* ----------- Integração TikFinity → Pipas via preset ativo ----------- */
// Escuta mensagens vindas do jogo (ex: ranking, eventos)
window.addEventListener("message", (evt) => {
  if (evt.data?.type === "PIPA_READY") {
    toast("🪁 Pipa Interativa conectado ao painel!");
    const statusEl = document.getElementById("pipa-conn-status");
    if (statusEl) {
      statusEl.textContent = "🟢 Jogo aberto e conectado";
      statusEl.style.color = "var(--green)";
    }
  }
  if (evt.data?.type === "SQUID_READY") {
    toast("🥔 Squid Run conectado ao painel!");
    const statusEl = document.getElementById("squid-conn-status");
    if (statusEl) {
      statusEl.textContent = "🟢 Jogo aberto e conectado";
      statusEl.style.color = "var(--green)";
    }
  }
  if (evt.data?.type === "TRUCK_READY") {
    toast("🚛 Puxa Truck conectado ao painel!");
    const statusEl = document.getElementById("truck-conn-status");
    if (statusEl) {
      statusEl.textContent = "🟢 Jogo aberto e conectado";
      statusEl.style.color = "var(--green)";
    }
  }
  if (evt.data?.type === "BLADE_READY") {
    toast("⚔️ Blade Arena conectado ao painel!");
    const statusEl = document.getElementById("blade-conn-status");
    if (statusEl) {
      statusEl.textContent = "🟢 Jogo aberto e conectado";
      statusEl.style.color = "var(--green)";
    }
  }
});

/* ----------- createPresetForGame override: abrir jogo ao criar preset de Pipas ----------- */
const _origCreatePreset = createPresetForGame;
window.createPresetForGame = function(gameId) {
  _origCreatePreset(gameId);
  if (gameId === PIPA_GAME_ID) {
    // Pré-popular com gatilhos padrão do jogo
    const p = state.presets[state.presets.length - 1];
    if (p && p.triggers.length === 0) {
      p.triggers = [
        { id: uid(), eventId: "follow",       actionId: "SPAWN_RANDOM",    count: 1, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "like",         actionId: "CURA_15",         count: 50, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "share",        actionId: "SPAWN_CEROL",     count: 1, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "subscribe",    actionId: "SPAWN_LARGE_CEROL", count: 1, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "chat_command", actionId: "SPAWN_CHILENA",   count: 1, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "!pipa", audioName: "", audioVolume: 100, giftId: null },
      ];
      saveState(state);
      renderEditor();
      toast("🪁 Gatilhos padrão do Pipa Interativa adicionados!");
    }
  }
  if (gameId === SF_GAME_ID) {
    const p = state.presets[state.presets.length - 1];
    if (p && p.triggers.length === 0) {
      p.triggers = [
        { id: uid(), eventId: "follow",       actionId: "JOIN_QUEUE",            count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "like",         actionId: "LUTA_AUTOMATICA",       count: 50, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "share",        actionId: "RESTAURAR_SANGUE_30",   count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "subscribe",    actionId: "COMBO_ESPECIAL",        count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "chat_command", actionId: "PODERES_ALEATORIO",     count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "!luta", audioName: "", audioVolume: 100, giftId: null },
      ];
      saveState(state);
      renderEditor();
      toast("🥊 Gatilhos padrão do Street Fighter Interativo adicionados!");
    }
  }
  if (gameId === SQUID_GAME_ID) {
    const p = state.presets[state.presets.length - 1];
    if (p && p.triggers.length === 0) {
      p.triggers = [
        { id: uid(), eventId: "follow",       actionId: "SPAWN_JOGADOR",      count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "like",         actionId: "TEMPO_MAIS20",       count: 50, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "share",        actionId: "ESCUDO",             count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "subscribe",    actionId: "SPAWN_DRONE_GRANDE", count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "chat_command", actionId: "SPAWN_BOMBA",        count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "!bomba", audioName: "", audioVolume: 100, giftId: null },
      ];
      saveState(state);
      renderEditor();
      toast("🥔 Gatilhos padrão do Squid Run adicionados!");
    }
  }
  if (gameId === TRUCK_GAME_ID) {
    const p = state.presets[state.presets.length - 1];
    if (p && p.triggers.length === 0) {
      p.triggers = [
        { id: uid(), eventId: "follow",       actionId: "FORCA_ROSA_1", count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "like",         actionId: "FORCA_AZUL_1", count: 50, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "share",        actionId: "FORCA_ROSA_2", count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "subscribe",    actionId: "FORCA_AZUL_4", count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "chat_command", actionId: "FORCA_ROSA_5", count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "!nitro", audioName: "", audioVolume: 100, giftId: null },
      ];
      saveState(state);
      renderEditor();
      toast("🚛 Gatilhos padrão do Puxa Truck adicionados!");
    }
  }
  if (gameId === BLADE_GAME_ID) {
    const p = state.presets[state.presets.length - 1];
    if (p && p.triggers.length === 0) {
      p.triggers = [
        { id: uid(), eventId: "follow",       actionId: "SPAWN",         count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "like",         actionId: "PLUS25P",       count: 50, repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "share",        actionId: "SHIELD",        count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "subscribe",    actionId: "POWER_NITROX",  count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "", audioName: "", audioVolume: 100, giftId: null },
        { id: uid(), eventId: "chat_command", actionId: "POWER_GRAVIT",  count: 1,  repetition: 1, interval: 100, delay: 0, multiplier: false, param: "", text: "!ultimate", audioName: "", audioVolume: 100, giftId: null },
      ];
      saveState(state);
      renderEditor();
      toast("⚔️ Gatilhos padrão do Blade Arena adicionados!");
    }
  }
};

/* ----------- Injetar integração no Pipa Interativa (postMessage receiver) ----------- */
// O jogo deve escutar window.addEventListener("message", ...) e executar as ações
// Isso já está configurado na versão modificada do index.html do jogo.

/* ============================================================
   Conexão do PAINEL com o TikFinity (WebSocket local)
   Mesmo servidor/porta usados dentro do jogo (ws://localhost:21213/).
   A conexão é (re)aberta sempre que a lista de ações (preset/gatilhos)
   é salva, e também pode ser ligada/desligada manualmente no botão
   "Connect By Server" da aba Overlays.
   ============================================================ */

let tikfinitySocket = null;
let tikfinityReconnectTimer = null;
let tikfinityWarnedOnce = false;
const tikfinityLikeState = {}; // { presetId: { count, cooldown } }

function normalizeGiftKey(str) {
  return String(str || "").toLowerCase().trim();
}

function setTikfinityStatus(connected, connecting) {
  const dot = document.getElementById("tikfinity-dot");
  const label = document.getElementById("tikfinity-label");
  const btn = document.getElementById("btn-connect-tikfinity");
  if (dot) dot.classList.toggle("online", !!connected);
  if (label) {
    label.textContent = connected
      ? "🟢 Conectado ao TikFinity"
      : (connecting ? "🟡 Conectando…" : "⚪ Desconectado");
  }
  if (btn) btn.textContent = connected ? "Desconectar" : "Connect By Server";
}

function connectTikFinity() {
  if (tikfinitySocket && (tikfinitySocket.readyState === WebSocket.OPEN || tikfinitySocket.readyState === WebSocket.CONNECTING)) {
    return; // já conectado ou conectando
  }
  clearTimeout(tikfinityReconnectTimer);
  setTikfinityStatus(false, true);

  let socket;
  try {
    socket = new WebSocket("ws://localhost:21213/");
  } catch (e) {
    setTikfinityStatus(false, false);
    toast("Não foi possível iniciar a conexão com o TikFinity");
    return;
  }
  tikfinitySocket = socket;

  socket.onopen = () => {
    setTikfinityStatus(true, false);
    tikfinityWarnedOnce = false;
    toast("🎵 Conectado ao TikFinity");
  };

  socket.onmessage = (event) => {
    let res;
    try { res = JSON.parse(event.data); } catch (e) { return; }
    const d = res.data || res;
    if (!d) return;

    const ev = (res.event || "").toLowerCase();
    const user = d.nickname || d.uniqueId || "Espectador";
    const avatar = d.profilePictureUrl || d.profilePicUrl || d.avatar || null;

    handleTikFinityEvent(ev, d, user, avatar);
  };

  socket.onclose = () => {
    setTikfinityStatus(false, false);
    if (!tikfinityWarnedOnce) {
      tikfinityWarnedOnce = true;
      toast("⚠️ TikFinity não respondeu em ws://localhost:21213 — verifique se o app do TikFinity está aberto");
    }
    tikfinitySocket = null;
    tikfinityReconnectTimer = setTimeout(connectTikFinity, 5000);
  };

  socket.onerror = () => {
    // onclose cuida da tentativa de reconexão
  };
}

function disconnectTikFinity() {
  clearTimeout(tikfinityReconnectTimer);
  tikfinityWarnedOnce = false;
  if (tikfinitySocket) {
    tikfinitySocket.onclose = null; // evita reconexão automática
    tikfinitySocket.close();
    tikfinitySocket = null;
  }
  setTikfinityStatus(false, false);
}

function toggleTikFinityConnection() {
  if (tikfinitySocket && tikfinitySocket.readyState === WebSocket.OPEN) {
    disconnectTikFinity();
  } else {
    connectTikFinity();
  }
}

function handleTikFinityEvent(ev, d, user, avatar) {
  const preset = activePreset();
  if (!preset) return;
  const triggers = preset.triggers || [];
  let trigger = null;

  if (ev === "gift") {
    const giftName = normalizeGiftKey(d.giftName);
    trigger = triggers.find(t => {
      if (t.eventId !== "gift" || !t.giftId) return false;
      const gift = GIFT_CATALOG.find(g => g.id === t.giftId);
      return gift && normalizeGiftKey(gift.label) === giftName;
    });
  } else if (ev === "chat") {
    const comment = normalizeGiftKey(d.comment);
    trigger = triggers.find(t => t.eventId === "chat_command" && t.text && comment.includes(normalizeGiftKey(t.text)));
  } else if (ev === "command") {
    const cmd = normalizeGiftKey(d.command);
    trigger = triggers.find(t => t.eventId === "chat_command" && normalizeGiftKey(t.text) === cmd);
  } else if (ev === "share") {
    trigger = triggers.find(t => t.eventId === "share");
  } else if (ev === "follow") {
    trigger = triggers.find(t => t.eventId === "follow");
  } else if (ev === "subscribe" || ev === "subscribe_gift" || ev === "member") {
    trigger = triggers.find(t => t.eventId === "subscribe");
  } else if (ev === "like") {
    const likeTrigger = triggers.find(t => t.eventId === "like");
    if (!likeTrigger) return;
    const st = tikfinityLikeState[preset.id] || (tikfinityLikeState[preset.id] = { count: 0, cooldown: false });
    if (st.cooldown) return;
    st.count += parseInt(d.likeCount) || 1;
    if (st.count >= (likeTrigger.count || 1)) {
      st.cooldown = true;
      fireTikFinityTrigger(likeTrigger, user, avatar);
      setTimeout(() => { st.cooldown = false; st.count = 0; }, 2000);
    }
    return;
  }

  if (trigger) fireTikFinityTrigger(trigger, user, avatar);
}

function fireTikFinityTrigger(trigger, user, avatar) {
  const action = ACTION_TYPES.find(a => a.id === trigger.actionId)
    || (typeof PIPA_ACTION_TYPES !== "undefined" ? PIPA_ACTION_TYPES.find(a => a.id === trigger.actionId) : null)
    || (typeof SQUID_ACTION_TYPES !== "undefined" ? SQUID_ACTION_TYPES.find(a => a.id === trigger.actionId) : null)
    || (typeof TRUCK_ACTION_TYPES !== "undefined" ? TRUCK_ACTION_TYPES.find(a => a.id === trigger.actionId) : null)
    || (typeof BLADE_ACTION_TYPES !== "undefined" ? BLADE_ACTION_TYPES.find(a => a.id === trigger.actionId) : null);

  logTikFinityEvent(user, action, trigger);
  toast(`${action ? action.icon : "⚡"} ${user} → ${action ? action.label : trigger.actionId}`);

  // Se o jogo Pipa Interativa estiver aberto nesta sessão, repassa a ação de verdade
  if (pipaGameWindow && !pipaGameWindow.closed) {
    sendPipaCommand(trigger.actionId, user, avatar);
  }
  // Se o jogo Squid Run estiver aberto nesta sessão, repassa a ação de verdade
  if (squidGameWindow && !squidGameWindow.closed) {
    sendSquidCommand(trigger.actionId, user, avatar);
  }
  // Se o jogo Puxa Truck estiver aberto nesta sessão, repassa a ação de verdade
  if (truckGameWindow && !truckGameWindow.closed) {
    sendTruckCommand(trigger.actionId, user, avatar);
  }
  // Se o jogo Blade Arena estiver aberto nesta sessão, repassa a ação de verdade
  if (bladeGameWindow && !bladeGameWindow.closed) {
    sendBladeCommand(trigger.actionId, user, avatar);
  }
}

function logTikFinityEvent(user, action, trigger) {
  const log = document.getElementById("tikfinity-log");
  if (!log) return;
  const line = document.createElement("div");
  line.className = "tikfinity-log-line";
  const hora = new Date().toLocaleTimeString();
  line.textContent = `${hora} — ${user} → ${action ? action.label : trigger.actionId}`;
  log.prepend(line);
  while (log.childElementCount > 30) log.removeChild(log.lastChild);
}
