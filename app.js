const DIR_INDEX = { down: 0, right: 1, up: 2, left: 3 };
const ACTIONS = new Set(["idle", "walk", "attack", "mine"]);

const WEAPON_OPTIONS = [
  { value: "none", label: "None" },
  { value: "sword", label: "Sword" },
  { value: "axe", label: "Axe" },
  { value: "bow", label: "Bow (2H)" },
  { value: "spear", label: "Spear (2H)" },
  { value: "orb", label: "Orb" },
  { value: "shield", label: "Shield" },
  { value: "pickaxe", label: "Pickaxe (2H)" }
];

const TWO_HAND = new Set(["bow", "spear", "pickaxe"]);

const BUILTIN = {
  base: "assets/character/pj_gargoyle.png",
  weaponPath: (type, slot) => {
    if (type === "none") return null;
    if (type === "shield") return "assets/weapons/shield.png";
    if (type === "pickaxe") return "assets/weapons/pickaxe.png";
    if (type === "bow") return "assets/weapons/bow.png";
    if (type === "spear") return "assets/weapons/spear.png";
    if (type === "sword") return slot === "hand_l" ? "assets/weapons/sword_left.png" : "assets/weapons/sword_right.png";
    if (type === "axe") return slot === "hand_l" ? "assets/weapons/axe_left.png" : "assets/weapons/axe_right.png";
    if (type === "orb") return slot === "hand_l" ? "assets/weapons/orb_left.png" : "assets/weapons/orb_right.png";
    return null;
  },
  armorSet: {
    none: { head: null, body: null, hands: null, feet: null },
    crimson: {
      head: "assets/armor/crimson_hat.png",
      body: "assets/armor/crimson_armor.png",
      hands: "assets/armor/crimson_gloves.png",
      feet: "assets/armor/crimson_boots.png"
    },
    azure: {
      head: "assets/armor/azure_hat.png",
      body: "assets/armor/azure_armor.png",
      hands: "assets/armor/azure_gloves.png",
      feet: "assets/armor/azure_boots.png"
    },
    emerald: {
      head: "assets/armor/emerald_hat.png",
      body: "assets/armor/emerald_armor.png",
      hands: "assets/armor/emerald_gloves.png",
      feet: "assets/armor/emerald_boots.png"
    }
  }
};

const ui = {
  action: document.getElementById("action"),
  direction: document.getElementById("direction"),
  scale: document.getElementById("scale"),
  speed: document.getElementById("speed"),
  loopAttack: document.getElementById("loopAttack"),
  frameWidth: document.getElementById("frameWidth"),
  frameHeight: document.getElementById("frameHeight"),
  rightWeapon: document.getElementById("rightWeapon"),
  leftWeapon: document.getElementById("leftWeapon"),
  rightWeaponFile: document.getElementById("rightWeaponFile"),
  leftWeaponFile: document.getElementById("leftWeaponFile"),
  comboHint: document.getElementById("comboHint"),
  armorSet: document.getElementById("armorSet"),
  baseFile: document.getElementById("baseFile"),
  headFile: document.getElementById("headFile"),
  bodyFile: document.getElementById("bodyFile"),
  handsFile: document.getElementById("handsFile"),
  feetFile: document.getElementById("feetFile"),
  baseExample: document.getElementById("baseExample"),
  debug: document.getElementById("debug"),
  stage: document.getElementById("stage")
};

const ctx = ui.stage.getContext("2d");
ctx.imageSmoothingEnabled = false;

const state = {
  action: "idle",
  direction: "down",
  frameWidth: 128,
  frameHeight: 128,
  frameCount: 9,
  scale: 4,
  speedScale: 1,
  loopAttack: true,
  rightWeapon: "none",
  leftWeapon: "none",
  attackStyle: "normal",
  frame: 0,
  elapsed: 0,
  imageCache: new Map(),
  layers: {
    base: { key: null, img: null },
    weaponRight: { key: null, img: null },
    weaponLeft: { key: null, img: null },
    armorHead: { key: null, img: null },
    armorBody: { key: null, img: null },
    armorHands: { key: null, img: null },
    armorFeet: { key: null, img: null }
  }
};

function populateWeaponSelects() {
  for (const option of WEAPON_OPTIONS) {
    const a = document.createElement("option");
    a.value = option.value;
    a.textContent = option.label;
    ui.rightWeapon.appendChild(a);

    const b = document.createElement("option");
    b.value = option.value;
    b.textContent = option.label;
    ui.leftWeapon.appendChild(b);
  }
  ui.rightWeapon.value = "none";
  ui.leftWeapon.value = "none";
}

function resolveAttackStyle(rightType, leftType, action) {
  if (action === "mine") return "pickaxe";
  const types = new Set([rightType, leftType]);
  if (types.has("bow")) return "bow";
  if (types.has("orb")) return "orb";
  if (types.has("spear")) return "spear";
  if (types.has("pickaxe")) return "pickaxe";
  if (types.has("sword") || types.has("axe") || types.has("shield")) return "multi";
  return "normal";
}

function bodyAttackBaseRow(style, img) {
  if (style === "multi") return 12;
  if (style === "bow") return 16;
  if (style === "spear") return 20;
  if (style === "orb") return 24;
  if (style === "pickaxe") {
    if (!img) return 24;
    const totalRows = Math.floor(img.height / state.frameHeight);
    return Math.max(0, totalRows - 4);
  }
  return 4;
}

function layerAttackBaseRow({ shieldOrbAttack, isShield }) {
  if (shieldOrbAttack && isShield) return 12;
  return 8;
}

function rowForBody(action, direction, style, baseImg) {
  const d = DIR_INDEX[direction] ?? 0;
  if (action === "walk") return [0, 1, 2, 3][d];
  if (action === "idle") return [8, 9, 10, 11][d];
  const base = bodyAttackBaseRow(style, baseImg);
  return base + d;
}

function rowForLayer(action, direction, attackBase) {
  const d = DIR_INDEX[direction] ?? 0;
  if (action === "walk") return 4 + d;
  if (action === "idle") return 0 + d;
  return attackBase + d;
}

function stepTimeFor(action) {
  if (action === "attack" || action === "mine") return 0.08;
  return 0.15;
}

function drawSpriteFrame(img, row, frame, x, y, scale) {
  if (!img) return;
  const sx = frame * state.frameWidth;
  const sy = row * state.frameHeight;
  const sw = state.frameWidth;
  const sh = state.frameHeight;
  const dw = state.frameWidth * scale;
  const dh = state.frameHeight * scale;

  if (sx + sw > img.width || sy + sh > img.height) return;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, dw, dh);
}

function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (state.imageCache.has(src)) return Promise.resolve(state.imageCache.get(src));
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      state.imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

async function setLayerPath(layerKey, path) {
  if (!path) {
    state.layers[layerKey] = { key: null, img: null };
    return;
  }
  try {
    const img = await loadImage(path);
    state.layers[layerKey] = { key: path, img };
  } catch {
    state.layers[layerKey] = { key: null, img: null };
  }
}

async function setLayerFile(layerKey, file) {
  if (!file) {
    state.layers[layerKey] = { key: null, img: null };
    return;
  }
  const key = URL.createObjectURL(file);
  const img = await loadImage(key);
  state.layers[layerKey] = { key, img };
}

function enforceWeaponRules() {
  const right = ui.rightWeapon.value;
  let left = ui.leftWeapon.value;

  if (right === "shield") {
    ui.rightWeapon.value = "none";
  }

  const normalizedRight = ui.rightWeapon.value;
  if (TWO_HAND.has(normalizedRight)) {
    left = "none";
    ui.leftWeapon.value = "none";
    ui.leftWeapon.disabled = true;
  } else {
    ui.leftWeapon.disabled = false;
  }

  if (left === "shield" && normalizedRight === "shield") {
    ui.rightWeapon.value = "none";
  }

  if (ui.leftWeapon.value === "bow" || ui.leftWeapon.value === "spear" || ui.leftWeapon.value === "pickaxe") {
    ui.leftWeapon.value = "none";
  }

  state.rightWeapon = ui.rightWeapon.value;
  state.leftWeapon = ui.leftWeapon.value;

  if (TWO_HAND.has(state.rightWeapon)) {
    ui.comboHint.textContent = "Arma 2H equipada: mano izquierda bloqueada.";
  } else if (state.rightWeapon === "orb" && state.leftWeapon === "shield") {
    ui.comboHint.textContent = "Combo orb + shield activo (shield usa ataque fila 12).";
  } else {
    ui.comboHint.textContent = "Combinación estándar.";
  }
}

async function refreshEquipmentLayers() {
  const rightPath = BUILTIN.weaponPath(state.rightWeapon, "hand_r");
  const leftPath = BUILTIN.weaponPath(state.leftWeapon, "hand_l");

  if (!state.layers.weaponRight.key || state.layers.weaponRight.key.startsWith("assets/weapons/")) {
    await setLayerPath("weaponRight", rightPath);
  }
  if (!state.layers.weaponLeft.key || state.layers.weaponLeft.key.startsWith("assets/weapons/")) {
    await setLayerPath("weaponLeft", leftPath);
  }
}

async function applyArmorSet(setKey) {
  const set = BUILTIN.armorSet[setKey] || BUILTIN.armorSet.none;
  await setLayerPath("armorHead", set.head);
  await setLayerPath("armorBody", set.body);
  await setLayerPath("armorHands", set.hands);
  await setLayerPath("armorFeet", set.feet);
}

function resetAttackFrameIfNeeded(prevAction, nextAction) {
  const attackLike = (v) => v === "attack" || v === "mine";
  if (prevAction !== nextAction && (attackLike(prevAction) || attackLike(nextAction))) {
    state.frame = 0;
    state.elapsed = 0;
  }
}

function render() {
  ctx.clearRect(0, 0, ui.stage.width, ui.stage.height);

  const cx = Math.floor(ui.stage.width / 2 - (state.frameWidth * state.scale) / 2);
  const cy = Math.floor(ui.stage.height / 2 - (state.frameHeight * state.scale) / 2);

  state.attackStyle = resolveAttackStyle(state.rightWeapon, state.leftWeapon, state.action);

  const bodyRow = rowForBody(state.action, state.direction, state.attackStyle, state.layers.base.img);
  const shieldOrbAttack = state.rightWeapon === "orb" && state.leftWeapon === "shield";

  const layerRows = {
    weaponLeft: rowForLayer(
      state.action,
      state.direction,
      layerAttackBaseRow({ shieldOrbAttack, isShield: state.leftWeapon === "shield" })
    ),
    weaponRight: rowForLayer(
      state.action,
      state.direction,
      layerAttackBaseRow({ shieldOrbAttack, isShield: state.rightWeapon === "shield" })
    ),
    armorBody: rowForLayer(state.action, state.direction, 8),
    armorHands: rowForLayer(state.action, state.direction, 8),
    armorFeet: rowForLayer(state.action, state.direction, 8),
    armorHead: rowForLayer(state.action, state.direction, 8)
  };

  const drawOrder = [
    ["base", bodyRow],
    ["weaponLeft", layerRows.weaponLeft],
    ["weaponRight", layerRows.weaponRight],
    ["armorBody", layerRows.armorBody],
    ["armorHands", layerRows.armorHands],
    ["armorFeet", layerRows.armorFeet],
    ["armorHead", layerRows.armorHead]
  ];

  for (const [layerKey, row] of drawOrder) {
    const img = state.layers[layerKey].img;
    drawSpriteFrame(img, row, state.frame, cx, cy, state.scale);
  }

  ui.debug.textContent = [
    `action: ${state.action}`,
    `direction: ${state.direction}`,
    `attackStyle: ${state.attackStyle}`,
    `frame: ${state.frame + 1}/${state.frameCount}`,
    `bodyRow: ${bodyRow}`,
    `right: ${state.rightWeapon}`,
    `left: ${state.leftWeapon}`
  ].join("\n");
}

let lastTs = 0;
function tick(ts) {
  const dt = Math.min(0.05, (ts - lastTs) / 1000 || 0);
  lastTs = ts;

  const step = stepTimeFor(state.action) / state.speedScale;
  state.elapsed += dt;

  while (state.elapsed >= step) {
    state.elapsed -= step;
    state.frame += 1;

    if (state.frame >= state.frameCount) {
      if (state.action === "attack" || state.action === "mine") {
        if (state.loopAttack) {
          state.frame = 0;
        } else {
          state.frame = state.frameCount - 1;
        }
      } else {
        state.frame = 0;
      }
    }
  }

  render();
  requestAnimationFrame(tick);
}

function onActionChange() {
  const previous = state.action;
  const next = ACTIONS.has(ui.action.value) ? ui.action.value : "idle";
  state.action = next;
  resetAttackFrameIfNeeded(previous, next);
}

function bindEvents() {
  ui.action.addEventListener("change", onActionChange);
  ui.direction.addEventListener("change", () => {
    state.direction = ui.direction.value;
  });
  ui.scale.addEventListener("input", () => {
    state.scale = Number(ui.scale.value);
  });
  ui.speed.addEventListener("input", () => {
    state.speedScale = Number(ui.speed.value) / 100;
  });
  ui.loopAttack.addEventListener("change", () => {
    state.loopAttack = ui.loopAttack.checked;
  });
  ui.frameWidth.addEventListener("change", () => {
    state.frameWidth = Math.max(16, Number(ui.frameWidth.value) || 128);
  });
  ui.frameHeight.addEventListener("change", () => {
    state.frameHeight = Math.max(16, Number(ui.frameHeight.value) || 128);
  });

  ui.rightWeapon.addEventListener("change", async () => {
    enforceWeaponRules();
    await refreshEquipmentLayers();
  });
  ui.leftWeapon.addEventListener("change", async () => {
    enforceWeaponRules();
    await refreshEquipmentLayers();
  });
  ui.rightWeaponFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("weaponRight", file);
  });
  ui.leftWeaponFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("weaponLeft", file);
  });

  ui.armorSet.addEventListener("change", async () => {
    await applyArmorSet(ui.armorSet.value);
  });

  ui.baseFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("base", file);
  });
  ui.headFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("armorHead", file);
  });
  ui.bodyFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("armorBody", file);
  });
  ui.handsFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("armorHands", file);
  });
  ui.feetFile.addEventListener("change", async (e) => {
    const [file] = e.target.files || [];
    await setLayerFile("armorFeet", file);
  });

  ui.baseExample.addEventListener("click", async () => {
    await setLayerPath("base", BUILTIN.base);
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp") state.direction = ui.direction.value = "up";
    if (e.key === "ArrowDown") state.direction = ui.direction.value = "down";
    if (e.key === "ArrowLeft") state.direction = ui.direction.value = "left";
    if (e.key === "ArrowRight") state.direction = ui.direction.value = "right";
    if (e.key.toLowerCase() === "a") state.action = ui.action.value = "attack";
    if (e.key.toLowerCase() === "w") state.action = ui.action.value = "walk";
    if (e.key.toLowerCase() === "i") state.action = ui.action.value = "idle";
    if (e.key.toLowerCase() === "m") state.action = ui.action.value = "mine";
  });
}

async function boot() {
  populateWeaponSelects();
  bindEvents();

  state.action = ui.action.value;
  state.direction = ui.direction.value;
  state.scale = Number(ui.scale.value);
  state.speedScale = Number(ui.speed.value) / 100;
  state.loopAttack = ui.loopAttack.checked;
  state.frameWidth = Number(ui.frameWidth.value) || 128;
  state.frameHeight = Number(ui.frameHeight.value) || 128;

  enforceWeaponRules();
  await setLayerPath("base", BUILTIN.base);
  await refreshEquipmentLayers();
  await applyArmorSet("none");

  requestAnimationFrame(tick);
}

boot();
