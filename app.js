const DIR_INDEX = { down: 0, right: 1, up: 2, left: 3 };
const ACTIONS = new Set(["idle", "walk", "attack", "mine"]);

const PYTHON_MIRROR_CONFIG = {
  frameSize: [128, 128],
  inputDirectionOrder: ["down", "right", "up", "left"],
  attackFolderPriority: ["Attack - Multiweapon", "Attack - Bow", "Attack"],
  attackExtraFolders: ["Attack - Orbe", "Attack - Orb"],
  profiles: {
    weapon: {
      actions: ["idle", "walk", "attack"],
      rowDirectionOrder: ["down", "left", "up", "right"],
      framesPerView: { walk: 9, attack: 9, idle: 9 }
    },
    hero: {
      actions: ["walk", "attack", "idle"],
      rowDirectionOrder: ["down", "left", "up", "right"],
      framesPerView: { walk: 9, attack: 9, idle: 9 }
    },
    enemy: {
      actions: ["idle", "walk", "attack"],
      rowDirectionOrder: ["down", "left", "up", "right"],
      framesPerView: { idle: 8, walk: 8, attack: 8 }
    },
    npc: {
      actions: ["idle"],
      rowDirectionOrder: ["down", "left", "up", "right"],
      framesPerView: { idle: "auto" }
    },
    item: {
      actions: ["idle"],
      rowDirectionOrder: ["down"],
      inputDirectionOrder: ["down"],
      framesPerView: { idle: 9 }
    }
  }
};

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
  stage: document.getElementById("stage"),
  folderPath: document.getElementById("folderPath"),
  framesDir: document.getElementById("framesDir"),
  genFrameWidth: document.getElementById("genFrameWidth"),
  genFrameHeight: document.getElementById("genFrameHeight"),
  buildSheetBtn: document.getElementById("buildSheetBtn"),
  buildStatus: document.getElementById("buildStatus"),
  generatedSelect: document.getElementById("generatedSelect"),
  useGeneratedBase: document.getElementById("useGeneratedBase"),
  useGeneratedRight: document.getElementById("useGeneratedRight"),
  useGeneratedLeft: document.getElementById("useGeneratedLeft"),
  downloadGenerated: document.getElementById("downloadGenerated")
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
  generatedAssets: [],
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
    const right = document.createElement("option");
    right.value = option.value;
    right.textContent = option.label;
    ui.rightWeapon.appendChild(right);

    const left = document.createElement("option");
    left.value = option.value;
    left.textContent = option.label;
    ui.leftWeapon.appendChild(left);
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
  if (ui.rightWeapon.value === "shield") {
    ui.rightWeapon.value = "none";
  }

  if (ui.leftWeapon.value === "bow" || ui.leftWeapon.value === "spear" || ui.leftWeapon.value === "pickaxe") {
    ui.leftWeapon.value = "none";
  }

  if (TWO_HAND.has(ui.rightWeapon.value)) {
    ui.leftWeapon.value = "none";
    ui.leftWeapon.disabled = true;
  } else {
    ui.leftWeapon.disabled = false;
  }

  state.rightWeapon = ui.rightWeapon.value;
  state.leftWeapon = ui.leftWeapon.value;

  if (TWO_HAND.has(state.rightWeapon)) {
    ui.comboHint.textContent = "Arma 2H equipada: mano izquierda bloqueada.";
  } else if (state.rightWeapon === "orb" && state.leftWeapon === "shield") {
    ui.comboHint.textContent = "Combo orb + shield activo (shield usa attack row 12).";
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
    weaponLeft: rowForLayer(state.action, state.direction, shieldOrbAttack && state.leftWeapon === "shield" ? 12 : 8),
    weaponRight: rowForLayer(state.action, state.direction, shieldOrbAttack && state.rightWeapon === "shield" ? 12 : 8),
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
    drawSpriteFrame(state.layers[layerKey].img, row, state.frame, cx, cy, state.scale);
  }

  ui.debug.textContent = [
    `action: ${state.action}`,
    `direction: ${state.direction}`,
    `attackStyle: ${state.attackStyle}`,
    `frame: ${state.frame + 1}/${state.frameCount}`,
    `bodyRow: ${bodyRow}`,
    `right: ${state.rightWeapon}`,
    `left: ${state.leftWeapon}`,
    `generated: ${state.generatedAssets.length}`
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
        state.frame = state.loopAttack ? 0 : state.frameCount - 1;
      } else {
        state.frame = 0;
      }
    }
  }

  render();
  requestAnimationFrame(tick);
}

function classifyFolder(name) {
  const lower = name.toLowerCase();
  if (lower.startsWith("npc_")) return "npc";
  if (lower.startsWith("i_")) return "item";
  if (lower.startsWith("w_")) return "weapon";
  if (lower.startsWith("pj_")) return "hero";
  if (lower.startsWith("e") && lower.includes("_")) {
    const prefix = name.split("_", 1)[0];
    if (/^e\d+$/i.test(prefix)) return "enemy";
  }
  return null;
}

function outputNameForFolder(name) {
  const trimmed = name.trim();
  if (!trimmed.includes("_")) return trimmed;
  const idx = trimmed.indexOf("_");
  const prefix = trimmed.slice(0, idx);
  const rest = trimmed.slice(idx + 1);
  if (!rest) return trimmed;
  const lower = prefix.toLowerCase();
  if (lower === "npc" || lower === "i" || lower === "w" || /^e\d+$/.test(lower)) return rest.trim() || trimmed;
  return trimmed;
}

function validateOutputBase(name, folderName) {
  if (!name) throw new Error(`Nombre inválido derivado de ${folderName}`);
  const lowered = name.toLowerCase();
  if (!/^[a-z0-9_]+$/.test(lowered)) {
    throw new Error(`Nombre inválido '${name}' en ${folderName}. Usa a-z, 0-9, _`);
  }
  return lowered;
}

function findFolderCaseInsensitive(subdirs, target) {
  return subdirs.find((name) => name.toLowerCase() === target.toLowerCase()) || null;
}

function pickAttackFolder(subdirs) {
  for (const candidate of PYTHON_MIRROR_CONFIG.attackFolderPriority) {
    const found = findFolderCaseInsensitive(subdirs, candidate);
    if (found) return found;
  }
  const matches = subdirs.filter((name) => name.toLowerCase().startsWith("attack")).sort();
  return matches[0] || null;
}

function pickOrderedAttackFolders(subdirs) {
  const matched = [];
  for (const name of subdirs) {
    const m = name.match(/^a(\d+)_/i);
    if (m) matched.push({ order: Number(m[1]), name });
  }
  matched.sort((a, b) => a.order - b.order);
  return matched.map((v) => v.name);
}

function pickExtraAttackFolders(subdirs) {
  const out = [];
  for (const candidate of PYTHON_MIRROR_CONFIG.attackExtraFolders) {
    const found = findFolderCaseInsensitive(subdirs, candidate);
    if (found && !out.includes(found)) out.push(found);
  }
  return out;
}

function parseSelectedFolderFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.name.toLowerCase().endsWith(".png"));
  if (files.length === 0) throw new Error("No se encontraron PNG en la carpeta seleccionada.");

  const roots = new Set();
  for (const file of files) {
    const rel = (file.webkitRelativePath || "").split("/").filter(Boolean);
    if (rel.length < 3) {
      throw new Error("Formato inválido: se esperan subcarpetas por acción (Idle/Walk/Attack).");
    }
    roots.add(rel[0]);
  }

  if (roots.size !== 1) {
    throw new Error("Selecciona solo una carpeta raíz (ejemplo: PJ_Gargoyle). Se detectaron múltiples carpetas.");
  }

  const rootName = [...roots][0];
  const bySubfolder = new Map();

  for (const file of files) {
    const rel = (file.webkitRelativePath || "").split("/").filter(Boolean);
    const sub = rel[1];
    const filename = rel[rel.length - 1];
    if (!bySubfolder.has(sub)) bySubfolder.set(sub, []);
    bySubfolder.get(sub).push({ filename, file });
  }

  for (const [, entries] of bySubfolder.entries()) {
    entries.sort((a, b) => {
      const na = Number(a.filename.replace(/\D/g, ""));
      const nb = Number(b.filename.replace(/\D/g, ""));
      if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
      return a.filename.localeCompare(b.filename);
    });
  }

  return { rootName, bySubfolder };
}

function buildRowsFromFolderStructure(rootName, bySubfolder, frameW, frameH) {
  const objectType = classifyFolder(rootName);
  if (!objectType) {
    throw new Error("Prefijo no válido. Usa PJ_, W_, NPC_, I_ o E#_.");
  }

  const profile = PYTHON_MIRROR_CONFIG.profiles[objectType];
  if (!profile) throw new Error(`No existe perfil para tipo ${objectType}`);

  const subdirs = [...bySubfolder.keys()];
  const inputDirectionOrder = profile.inputDirectionOrder || PYTHON_MIRROR_CONFIG.inputDirectionOrder;
  const orderedAttackFolders = pickOrderedAttackFolders(subdirs);
  const extraAttackFolders = rootName.toLowerCase() === "w_shield" ? pickExtraAttackFolders(subdirs) : [];

  const actionEntries = [];
  for (const action of profile.actions) {
    let folder = null;
    if (action === "attack") folder = pickAttackFolder(subdirs);
    else folder = findFolderCaseInsensitive(subdirs, action);
    if (!folder) throw new Error(`Falta carpeta '${action}' en ${rootName}`);
    actionEntries.push({ action, folder, framesKey: action });
  }
  for (const folder of orderedAttackFolders) {
    actionEntries.push({ action: "attack_extra", folder, framesKey: "attack" });
  }
  for (const folder of extraAttackFolders) {
    if (!orderedAttackFolders.includes(folder)) {
      actionEntries.push({ action: "attack_extra", folder, framesKey: "attack" });
    }
  }

  const rows = [];
  const rowFrameCounts = [];
  const framesPerViewConfig = profile.framesPerView || {};

  for (const entry of actionEntries) {
    const files = bySubfolder.get(entry.folder) || [];
    if (files.length === 0) throw new Error(`No hay PNG en ${entry.folder}`);
    if (files.length % inputDirectionOrder.length !== 0) {
      throw new Error(`Cantidad de PNG inválida en ${entry.folder}. Debe ser divisible por ${inputDirectionOrder.length}.`);
    }

    const totalPerDirection = files.length / inputDirectionOrder.length;
    let desired = framesPerViewConfig[entry.framesKey];
    if (desired === undefined || desired === "auto" || desired === null) desired = totalPerDirection;
    if (desired > totalPerDirection) {
      throw new Error(`Faltan frames en ${entry.folder}. Necesita ${desired}, tiene ${totalPerDirection}.`);
    }

    const byDirection = {};
    for (let idx = 0; idx < inputDirectionOrder.length; idx += 1) {
      const direction = inputDirectionOrder[idx];
      const start = idx * totalPerDirection;
      const end = (idx + 1) * totalPerDirection;
      byDirection[direction] = files.slice(start, end);
    }

    for (const direction of profile.rowDirectionOrder) {
      if (!byDirection[direction]) {
        throw new Error(`Dirección faltante '${direction}' en ${entry.folder}`);
      }
      const rowFrames = byDirection[direction].slice(0, desired).map((f) => f.file);
      rows.push(rowFrames);
      rowFrameCounts.push(desired);
    }
  }

  if (rows.length === 0) throw new Error(`No se pudieron construir filas para ${rootName}`);

  return {
    rootName,
    objectType,
    rows,
    rowFrameCounts,
    frameW,
    frameH,
    outputBase: validateOutputBase(outputNameForFolder(rootName), rootName)
  };
}

async function drawRowsToSpriteSheet(sheetData) {
  const { rows, rowFrameCounts, frameW, frameH, outputBase, rootName, objectType } = sheetData;
  const maxColumns = Math.max(...rowFrameCounts);
  const outCanvas = document.createElement("canvas");
  outCanvas.width = maxColumns * frameW;
  outCanvas.height = rows.length * frameH;
  const outCtx = outCanvas.getContext("2d");
  outCtx.imageSmoothingEnabled = false;

  for (let row = 0; row < rows.length; row += 1) {
    const rowFrames = rows[row];
    for (let col = 0; col < maxColumns; col += 1) {
      const frameFile = rowFrames[col];
      if (!frameFile) continue;
      const bmp = await createImageBitmap(frameFile);
      outCtx.drawImage(bmp, 0, 0, bmp.width, bmp.height, col * frameW, row * frameH, frameW, frameH);
      bmp.close();
    }
  }

  const blob = await new Promise((resolve) => outCanvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("No se pudo exportar PNG");
  const url = URL.createObjectURL(blob);
  const img = await loadImage(url);

  return {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    name: `${outputBase}.png`,
    sourceFolder: rootName,
    objectType,
    frameW,
    frameH,
    rowCount: rows.length,
    frameCount: maxColumns,
    url,
    blob,
    img
  };
}

function generatedToOptionText(asset) {
  return `${asset.name} (${asset.objectType}, ${asset.frameCount}x${asset.rowCount})`;
}

function refreshGeneratedSelect() {
  ui.generatedSelect.innerHTML = "";
  if (state.generatedAssets.length === 0) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Sin generados";
    ui.generatedSelect.appendChild(opt);
    return;
  }
  for (const asset of state.generatedAssets) {
    const opt = document.createElement("option");
    opt.value = asset.id;
    opt.textContent = generatedToOptionText(asset);
    ui.generatedSelect.appendChild(opt);
  }
  ui.generatedSelect.value = state.generatedAssets[state.generatedAssets.length - 1].id;
}

function getSelectedGeneratedAsset() {
  const id = ui.generatedSelect.value;
  return state.generatedAssets.find((a) => a.id === id) || null;
}

function addGeneratedAsset(asset) {
  state.generatedAssets.push(asset);
  refreshGeneratedSelect();
}

async function applyGeneratedAssetAsLayer(layerKey, asset) {
  if (!asset) return;
  state.frameWidth = asset.frameW;
  state.frameHeight = asset.frameH;
  ui.frameWidth.value = String(asset.frameW);
  ui.frameHeight.value = String(asset.frameH);
  state.layers[layerKey] = { key: asset.url, img: asset.img };
}

function setBuildStatus(message, isError = false) {
  ui.buildStatus.textContent = message;
  ui.buildStatus.style.color = isError ? "#ff8f8f" : "#9ca9ba";
}

async function handleBuildSheet() {
  try {
    setBuildStatus("Validando carpeta...");
    const files = ui.framesDir.files;
    if (!files || files.length === 0) {
      throw new Error("Selecciona la carpeta de frames primero.");
    }

    const frameW = Math.max(16, Number(ui.genFrameWidth.value) || PYTHON_MIRROR_CONFIG.frameSize[0]);
    const frameH = Math.max(16, Number(ui.genFrameHeight.value) || PYTHON_MIRROR_CONFIG.frameSize[1]);

    const parsed = parseSelectedFolderFiles(files);
    if (!ui.folderPath.value.trim()) {
      ui.folderPath.value = parsed.rootName;
    }

    const sheetData = buildRowsFromFolderStructure(parsed.rootName, parsed.bySubfolder, frameW, frameH);
    setBuildStatus("Generando spritesheet...");
    const generated = await drawRowsToSpriteSheet(sheetData);
    addGeneratedAsset(generated);

    if (generated.objectType === "weapon") {
      if (generated.name.includes("left")) {
        await applyGeneratedAssetAsLayer("weaponLeft", generated);
      } else {
        await applyGeneratedAssetAsLayer("weaponRight", generated);
      }
    } else {
      await applyGeneratedAssetAsLayer("base", generated);
    }

    setBuildStatus(`OK: ${generated.name} generado y cargado en el simulador.`);
  } catch (error) {
    setBuildStatus(`Error: ${error.message}`, true);
  }
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

  ui.buildSheetBtn.addEventListener("click", handleBuildSheet);

  ui.useGeneratedBase.addEventListener("click", async () => {
    const asset = getSelectedGeneratedAsset();
    await applyGeneratedAssetAsLayer("base", asset);
  });
  ui.useGeneratedRight.addEventListener("click", async () => {
    const asset = getSelectedGeneratedAsset();
    await applyGeneratedAssetAsLayer("weaponRight", asset);
  });
  ui.useGeneratedLeft.addEventListener("click", async () => {
    const asset = getSelectedGeneratedAsset();
    await applyGeneratedAssetAsLayer("weaponLeft", asset);
  });
  ui.downloadGenerated.addEventListener("click", () => {
    const asset = getSelectedGeneratedAsset();
    if (!asset) return;
    const a = document.createElement("a");
    a.href = asset.url;
    a.download = asset.name;
    a.click();
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
  refreshGeneratedSelect();

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
