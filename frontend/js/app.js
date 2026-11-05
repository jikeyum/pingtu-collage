import {
  ASPECTS,
  LAYOUTS,
  OUTPUT_SIZES,
  aspectRatio,
  outputDimensions,
} from "./engine.js";
import {
  canvasToBlob,
  makeThumbnail,
  renderExport,
  renderPreview,
} from "./render.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
const TAURI_INVOKE = window.__TAURI__?.core?.invoke || window.__TAURI__?.tauri?.invoke || null;
const IS_TAURI = Boolean(TAURI_INVOKE);

const MAX_IMAGES = 9;
const SAMPLE_NAMES = [
  "sample_01_sunrise.png",
  "sample_02_ocean.png",
  "sample_03_forest.png",
  "sample_04_city.png",
  "sample_05_desert.png",
  "sample_06_flowers.png",
];
const FORMATS = {
  png: { mime: "image/png", ext: "png", label: "PNG" },
  jpg: { mime: "image/jpeg", ext: "jpg", label: "JPG" },
  webp: { mime: "image/webp", ext: "webp", label: "WEBP" },
};
const SWATCHES = ["#FFFFFF", "#F7F0E6", "#1E1D22", "#FF6746", "#1C3550", "#C9D9CB"];
const SETTINGS_KEY = "pingtu.settings.v5";
let settingsReady = false;
const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
const DEFAULT_STYLE = {
  layout: "grid",
  borderEnabled: true,
  borderWidth: 26,
  gap: 14,
  radius: 16,
  background: "#FFFFFF",
  fit: "cover",
};

const state = {
  count: 4,
  slots: Array(4).fill(null),
  selected: null,
  style: { ...DEFAULT_STYLE },
  aspect: "square",
  output: "qhd",
  activeTab: "layout",
  format: "png",
  quality: 92,
  exportDir: "",
  draggingIndex: null,
  pendingInsert: null,
  pendingReplace: null,
  nextId: 1,
  confirmAction: null,
  loading: false,
};

const els = {
  stage: $("#stage"),
  previewShell: $("#previewShell"),
  previewCanvas: $("#previewCanvas"),
  imageGrid: $("#imageGrid"),
  imageCount: $("#imageCount"),
  countChips: $("#countChips"),
  topSummary: $("#topSummary"),
  statusCenter: $("#statusCenter"),
  stageDims: $("#stageDims"),
  stageAspect: $("#stageAspect"),
  stageSize: $("#stageSize"),
  stageStatus: $("#stageStatus"),
  stageFootText: $("#stageFootText"),
  stageCaption: $("#stageCaption"),
  exportNote: $("#exportNote"),
  exportPathInput: $("#exportPathInput"),
  exportBtn: $("#exportBtn"),
  exportBtn2: $("#exportBtn2"),
  addBtn: $("#addBtn"),
  addBtn2: $("#addBtn2"),
  pasteBtn: $("#pasteBtn"),
  sampleBtn: $("#sampleBtn"),
  clearBtn: $("#clearBtn"),
  moveLeftBtn: $("#moveLeftBtn"),
  moveRightBtn: $("#moveRightBtn"),
  replaceBtn: $("#replaceBtn"),
  removeBtn: $("#removeBtn"),
  selectionTools: $("#selectionTools"),
  selectionLabel: $("#selectionLabel"),
  layoutList: $("#layoutList"),
  fitSegment: $("#fitSegment"),
  ratioGrid: $("#ratioGrid"),
  sizeGrid: $("#sizeGrid"),
  ratioMeta: $("#ratioMeta"),
  outputDims: $("#outputDims"),
  borderToggle: $("#borderToggle"),
  borderSliders: $("#borderSliders"),
  borderWidth: $("#borderWidth"),
  borderWidthValue: $("#borderWidthValue"),
  gap: $("#gap"),
  gapValue: $("#gapValue"),
  radius: $("#radius"),
  radiusValue: $("#radiusValue"),
  colorCode: $("#colorCode"),
  swatchRow: $("#swatchRow"),
  resetBtn: $("#resetBtn"),
  tabs: $("#tabs"),
  tabIndicator: $("#tabIndicator"),
  fileInput: $("#fileInput"),
  replaceInput: $("#replaceInput"),
  loadingTip: $("#loadingTip"),
  dropOverlay: $("#dropOverlay"),
  fullscreenBtn: $("#fullscreenBtn"),
  centerImageBtn: $("#centerImageBtn"),
  fullscreenCanvas: $("#fullscreenCanvas"),
  fullscreenDims: $("#fullscreenDims"),
  toast: $("#toast"),
  toastText: $("#toastText"),
  confirmModal: $("#confirmModal"),
  confirmTitle: $("#confirmTitle"),
  confirmText: $("#confirmText"),
  confirmBtn: $("#confirmBtn"),
  exportModal: $("#exportModal"),
  exportDims: $("#exportDims"),
  exportCount: $("#exportCount"),
  formatGrid: $("#formatGrid"),
  qualityRow: $("#qualityRow"),
  qualityRange: $("#qualityRange"),
  qualityValue: $("#qualityValue"),
  confirmExportBtn: $("#confirmExportBtn"),
  quickExportBtn: $("#quickExportBtn"),
  exportProgress: $("#exportProgress"),
  progressText: $("#progressText"),
  fullscreenModal: $("#fullscreenModal"),
};

let previewFrame = null;
let pendingPulse = false;
let toastTimer = null;
let apiPromise = null;
let fileDragDepth = 0;
let lastPreview = null;
let panDrag = null;

async function setupTauriDrop() {
  if (!IS_TAURI) return;
  window.addEventListener("pingtu-tauri-drop", async (event) => {
    const files = [];
    for (const image of event.detail || []) {
      try {
        const response = await fetch(image.data_url);
        const blob = await response.blob();
        files.push(new File([blob], image.name || `image-${Date.now()}`, { type: image.mime || blob.type }));
      } catch (error) {
        console.warn("Cannot decode dropped image", error);
      }
    }
    if (files.length) await addFiles(files);
  });
  window.addEventListener("pingtu-tauri-drop-error", () => {
    showToast("无法读取拖入的图片", 2600, true);
  });
}

/* -------------------------------------------------------------------------- */
/* Boot                                                                       */
/* -------------------------------------------------------------------------- */

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    if (saved.style && typeof saved.style === "object") {
      state.style = { ...DEFAULT_STYLE, ...saved.style };
    }
    if (ASPECTS.some((item) => item.key === saved.aspect)) state.aspect = saved.aspect;
    if (OUTPUT_SIZES.some((item) => item.key === saved.output)) state.output = saved.output;
    if (FORMATS[saved.format]) state.format = saved.format;
    if (Number.isFinite(saved.quality)) state.quality = Math.min(100, Math.max(70, saved.quality));
    if (typeof saved.exportDir === "string") state.exportDir = saved.exportDir;
  } catch (error) {
    console.warn("Cannot load settings", error);
  }
}

function saveSettings() {
  if (!settingsReady) return;
  try {
    localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        style: state.style,
        aspect: state.aspect,
        output: state.output,
        format: state.format,
        quality: state.quality,
        exportDir: state.exportDir,
      }),
    );
  } catch (error) {
    console.warn("Cannot save settings", error);
  }
}

async function bootstrapExportDir() {
  if (!els.exportPathInput) return;
  if (!state.exportDir) {
    try {
      const api = await getApi();
      if (api?.get_export_dir) {
        state.exportDir = await api.get_export_dir();
        saveSettings();
      }
    } catch (error) {
      console.warn("Cannot resolve default export directory", error);
    }
  }
  els.exportPathInput.value = state.exportDir || "";
}

function init() {
  loadSettings();
  settingsReady = true;
  setupShortcutLabels();
  buildCountChips();
  buildLayouts();
  buildRatios();
  buildSizes();
  buildSwatches();
  bindEvents();
  bindDragAndDrop();
  setupTauriDrop();
  updateChrome();
  renderSlots();
  requestAnimationFrame(() => drawPreview(true));
  requestAnimationFrame(() => updateTabIndicator());
  new ResizeObserver(() => schedulePreview()).observe(els.stage);
  document.fonts?.ready?.then(() => schedulePreview());
  window.addEventListener("resize", () => {
    if (els.fullscreenModal.classList.contains("open")) drawFullscreen();
    schedulePreview();
  });
  bootstrapExportDir();
  maybeLoadDemo();
}

function setupShortcutLabels() {
  $$("[data-shortcut]").forEach((element) => {
    const key = element.dataset.shortcut === "export" ? "E" : "O";
    element.textContent = isMac ? `⌘ ${key}` : `Ctrl ${key}`;
  });
}

/* -------------------------------------------------------------------------- */
/* Builders                                                                   */
/* -------------------------------------------------------------------------- */

function buildCountChips() {
  els.countChips.innerHTML = "";
  for (let value = 1; value <= MAX_IMAGES; value += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "count-chip";
    button.textContent = String(value);
    button.dataset.count = String(value);
    button.setAttribute("aria-label", `选择 ${value} 个画位`);
    button.addEventListener("click", () => requestCount(value));
    els.countChips.appendChild(button);
  }
}

function layoutGlyph(key) {
  const glyphs = {
    grid: `
      <rect x="4" y="4" width="18" height="18" rx="2"/>
      <rect x="26" y="4" width="18" height="18" rx="2"/>
      <rect x="4" y="26" width="18" height="18" rx="2"/>
      <rect x="26" y="26" width="18" height="18" rx="2"/>`,
    row: `
      <rect x="4" y="7" width="10" height="34" rx="2"/>
      <rect x="19" y="7" width="10" height="34" rx="2"/>
      <rect x="34" y="7" width="10" height="34" rx="2"/>`,
    column: `
      <rect x="7" y="4" width="34" height="10" rx="2"/>
      <rect x="7" y="19" width="34" height="10" rx="2"/>
      <rect x="7" y="34" width="34" height="10" rx="2"/>`,
    hero: `
      <rect x="4" y="4" width="24" height="40" rx="2"/>
      <rect x="32" y="4" width="12" height="18" rx="2"/>
      <rect x="32" y="26" width="12" height="18" rx="2"/>`,
    mosaic: `
      <rect x="4" y="4" width="21" height="21" rx="2"/>
      <rect x="29" y="4" width="15" height="10" rx="2"/>
      <rect x="29" y="18" width="15" height="7" rx="2"/>
      <rect x="4" y="29" width="12" height="15" rx="2"/>
      <rect x="20" y="29" width="10" height="15" rx="2"/>
      <rect x="34" y="29" width="10" height="15" rx="2"/>`,
  };
  return `<svg viewBox="0 0 48 48" aria-hidden="true">${glyphs[key] || glyphs.grid}</svg>`;
}

function buildLayouts() {
  els.layoutList.innerHTML = "";
  LAYOUTS.forEach((layout) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "layout-option";
    button.dataset.layout = layout.key;
    button.innerHTML = `
      <span class="layout-glyph">${layoutGlyph(layout.key)}</span>
      <span class="layout-copy">
        <strong>${layout.title}</strong>
        <span>${layout.subtitle}</span>
      </span>
      <span class="layout-check">
        <svg class="icon"><use href="#i-check"></use></svg>
      </span>`;
    button.addEventListener("click", () => setLayout(layout.key));
    els.layoutList.appendChild(button);
  });
}

function buildRatios() {
  els.ratioGrid.innerHTML = "";
  ASPECTS.forEach((aspect) => {
    const box = 28;
    const scale = Math.min(box / aspect.w, 26 / aspect.h);
    const width = Math.max(8, Math.round(aspect.w * scale));
    const height = Math.max(8, Math.round(aspect.h * scale));
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ratio-option";
    button.dataset.aspect = aspect.key;
    button.innerHTML = `
      <span class="ratio-shape-wrap">
        <span class="ratio-shape" style="width:${width}px;height:${height}px"></span>
      </span>
      <strong>${aspect.label}</strong>
      <small>${aspect.name}</small>`;
    button.addEventListener("click", () => setAspect(aspect.key));
    els.ratioGrid.appendChild(button);
  });
}

function buildSizes() {
  els.sizeGrid.innerHTML = "";
  OUTPUT_SIZES.forEach((size) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "size-option";
    button.dataset.size = size.key;
    button.innerHTML = `<strong>${size.label}</strong><small>${size.name}</small>`;
    button.addEventListener("click", () => setOutputSize(size.key));
    els.sizeGrid.appendChild(button);
  });
}

function buildSwatches() {
  els.swatchRow.innerHTML = "";
  SWATCHES.forEach((color) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "swatch";
    button.dataset.color = color;
    button.style.setProperty("--swatch", color);
    button.setAttribute("aria-label", `边框颜色 ${color}`);
    button.addEventListener("click", () => setBackground(color));
    els.swatchRow.appendChild(button);
  });
  const custom = document.createElement("label");
  custom.className = "swatch custom";
  custom.title = "自定义颜色";
  custom.innerHTML = `<input id="customColor" type="color" value="${state.style.background}" aria-label="自定义边框颜色" />`;
  custom.querySelector("input").addEventListener("input", (event) => {
    setBackground(event.target.value.toUpperCase());
  });
  els.swatchRow.appendChild(custom);
}

/* -------------------------------------------------------------------------- */
/* Bind                                                                       */
/* -------------------------------------------------------------------------- */

function bindEvents() {
  els.addBtn.addEventListener("click", () => openFilePicker());
  els.addBtn2.addEventListener("click", () => openFilePicker());
  els.pasteBtn.addEventListener("click", pasteFromClipboard);
  els.sampleBtn.addEventListener("click", () => loadSamples(false));
  els.clearBtn.addEventListener("click", requestClear);
  els.exportBtn.addEventListener("click", openExportModal);
  els.exportBtn2.addEventListener("click", openExportModal);
  els.fullscreenBtn.addEventListener("click", openFullscreen);
  els.centerImageBtn.addEventListener("click", centerSelectedImage);
  els.resetBtn.addEventListener("click", resetStyle);

  els.moveLeftBtn.addEventListener("click", () => moveSelected(-1));
  els.moveRightBtn.addEventListener("click", () => moveSelected(1));
  els.replaceBtn.addEventListener("click", replaceSelected);
  els.removeBtn.addEventListener("click", removeSelected);

  els.fileInput.addEventListener("change", async (event) => {
    const files = event.target.files;
    const target = state.pendingInsert;
    state.pendingInsert = null;
    if (files?.length) await addFiles(files, { targetIndex: target });
    event.target.value = "";
  });

  els.replaceInput.addEventListener("change", async (event) => {
    const files = event.target.files;
    const target = state.pendingReplace;
    state.pendingReplace = null;
    if (files?.length && target !== null) {
      await replaceWithFile(files[0], target);
    }
    event.target.value = "";
  });

  $$(".tab-button").forEach((button) => {
    button.addEventListener("click", () => setTab(button.dataset.tab));
  });

  $$("#fitSegment .segment").forEach((button) => {
    button.addEventListener("click", () => setFit(button.dataset.fit));
  });

  els.borderToggle.addEventListener("change", () => {
    state.style.borderEnabled = els.borderToggle.checked;
    updateChrome();
    schedulePreview(true);
  });

  const sliders = [
    [els.borderWidth, "borderWidth", els.borderWidthValue, " px"],
    [els.gap, "gap", els.gapValue, " px"],
    [els.radius, "radius", els.radiusValue, " px"],
  ];
  sliders.forEach(([input, key, output, suffix]) => {
    input.addEventListener("input", () => {
      const value = Number(input.value);
      state.style[key] = value;
      output.textContent = `${value}${suffix}`;
      paintRange(input);
      saveSettings();
      schedulePreview();
    });
  });

  els.formatGrid.addEventListener("click", (event) => {
    const card = event.target.closest("[data-format]");
    if (!card) return;
    state.format = card.dataset.format;
    updateExportFormat();
    saveSettings();
  });

  els.qualityRange.addEventListener("input", () => {
    state.quality = Number(els.qualityRange.value);
    els.qualityValue.textContent = `${state.quality}%`;
    paintRange(els.qualityRange);
    saveSettings();
  });

  els.confirmBtn.addEventListener("click", () => {
    const action = state.confirmAction;
    state.confirmAction = null;
    closeModal("confirmModal");
    if (action) action();
  });

  els.confirmExportBtn.addEventListener("click", () => {
    startExport();
  });

  els.exportPathInput?.addEventListener("change", () => {
    state.exportDir = els.exportPathInput.value.trim();
    saveSettings();
  });

  $("#browseExportPath")?.addEventListener("click", async () => {
    try {
      const api = await getApi();
      const folder = await api?.choose_export_folder?.();
      if (folder) {
        state.exportDir = folder;
        els.exportPathInput.value = folder;
        saveSettings();
      }
    } catch (error) {
      showToast(`无法选择导出目录：${errorText(error)}`, 3200, true);
    }
  });

  els.fullscreenModal.addEventListener("click", (event) => {
    if (event.target === els.fullscreenModal) closeModal("fullscreenModal");
  });

  $$(".modal-layer").forEach((layer) => {
    layer.addEventListener("click", (event) => {
      if (event.target === layer && layer.id !== "fullscreenModal") closeModal(layer.id);
    });
  });

  $$("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => closeModal(button.dataset.closeModal));
  });

  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("paste", onPaste);

  els.previewCanvas.addEventListener("pointerdown", onPreviewPointerDown);
  els.previewCanvas.addEventListener("pointermove", onPreviewPointerMove);
  els.previewCanvas.addEventListener("pointerup", onPreviewPointerUp);
  els.previewCanvas.addEventListener("pointercancel", onPreviewPointerUp);
  els.previewCanvas.addEventListener("pointerleave", () => {
    if (!panDrag) els.previewCanvas.style.cursor = previewCursor();
  });
  els.previewCanvas.addEventListener("dblclick", onPreviewDoubleClick);
}

function onKeyDown(event) {
  const command = isMac ? event.metaKey : event.ctrlKey;
  const typing =
    event.target instanceof Element &&
    event.target.closest("input, textarea, select, [contenteditable='true']");
  if (command && event.key.toLowerCase() === "o") {
    event.preventDefault();
    openFilePicker();
    return;
  }
  if (command && event.key.toLowerCase() === "e") {
    event.preventDefault();
    openExportModal();
    return;
  }
  if (event.key === "Escape") {
    for (const layer of $$(".modal-layer.open")) closeModal(layer.id);
    if (state.selected !== null) {
      state.selected = null;
      renderSlots();
      updateSelectionTools();
      schedulePreview();
    }
    return;
  }
  if ((event.key === "Delete" || event.key === "Backspace") && state.selected !== null) {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    event.preventDefault();
    removeSelected();
    return;
  }
  if (typing) return;
  if (event.altKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
    event.preventDefault();
    moveSelected(event.key === "ArrowLeft" ? -1 : 1);
    return;
  }
  if (event.key === "0" && state.selected !== null) {
    event.preventDefault();
    centerSelectedImage();
    return;
  }
  const panKeys = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1],
  };
  if (panKeys[event.key] && state.selected !== null && state.slots[state.selected]) {
    event.preventDefault();
    const [x, y] = panKeys[event.key];
    nudgeSelectedImage(x, y, event.shiftKey ? 0.09 : 0.025);
  }
}

async function onPaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (const item of items) {
    if (item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length) {
    event.preventDefault();
    await addFiles(files);
  }
}

/* -------------------------------------------------------------------------- */
/* State updates                                                              */
/* -------------------------------------------------------------------------- */

function previewCursor() {
  if (state.selected === null || !state.slots[state.selected]) return "default";
  return panDrag ? "grabbing" : "grab";
}

function hitPreviewCell(x, y) {
  if (!lastPreview?.rects) return -1;
  return lastPreview.rects.findIndex(
    (rect) => x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h,
  );
}

function onPreviewPointerDown(event) {
  if (event.button !== 0) return;
  const index = hitPreviewCell(event.offsetX, event.offsetY);
  if (index < 0) {
    if (state.selected !== null) {
      selectSlot(null);
      schedulePreview();
    }
    return;
  }
  const item = state.slots[index];
  if (!item) {
    selectSlot(null);
    return;
  }
  event.preventDefault();
  selectSlot(index);
  panDrag = {
    index,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: Number(item.offsetX) || 0,
    originY: Number(item.offsetY) || 0,
    rect: lastPreview.rects[index],
    moved: false,
  };
  try {
    els.previewCanvas.setPointerCapture(event.pointerId);
  } catch {
    // Pointer capture is best-effort.
  }
  els.previewCanvas.classList.add("is-adjusting");
  els.previewCanvas.style.cursor = "grabbing";
}

function onPreviewPointerMove(event) {
  if (!panDrag) {
    const index = hitPreviewCell(event.offsetX, event.offsetY);
    const overImage = index >= 0 && Boolean(state.slots[index]);
    els.previewCanvas.style.cursor = overImage ? "grab" : "default";
    return;
  }
  if (event.pointerId !== panDrag.pointerId) return;
  const dx = event.clientX - panDrag.startX;
  const dy = event.clientY - panDrag.startY;
  if (!panDrag.moved && Math.abs(dx) + Math.abs(dy) < 3) return;
  panDrag.moved = true;
  const item = state.slots[panDrag.index];
  if (!item) return;
  const factor = 1.8;
  item.offsetX = Math.max(
    -1,
    Math.min(1, panDrag.originX + (dx / Math.max(1, panDrag.rect.w)) * factor),
  );
  item.offsetY = Math.max(
    -1,
    Math.min(1, panDrag.originY + (dy / Math.max(1, panDrag.rect.h)) * factor),
  );
  els.previewCanvas.style.cursor = "grabbing";
  schedulePreview();
}

function onPreviewPointerUp(event) {
  if (!panDrag || event.pointerId !== panDrag.pointerId) return;
  try {
    els.previewCanvas.releasePointerCapture(event.pointerId);
  } catch {
    // Ignore.
  }
  const wasMoved = panDrag.moved;
  panDrag = null;
  els.previewCanvas.classList.remove("is-adjusting");
  els.previewCanvas.style.cursor = previewCursor();
  if (!wasMoved) selectSlot(state.selected);
  schedulePreview();
}

function onPreviewDoubleClick(event) {
  const index = hitPreviewCell(event.offsetX, event.offsetY);
  if (index < 0) return;
  if (state.slots[index]) {
    centerImage(index);
  } else {
    openFilePicker(index);
  }
}

function centerImage(index) {
  const item = state.slots[index];
  if (!item) return;
  item.offsetX = 0;
  item.offsetY = 0;
  schedulePreview();
  showToast("画面已居中", 1600);
}

function centerSelectedImage() {
  if (state.selected === null) return;
  centerImage(state.selected);
}

function nudgeSelectedImage(x, y, step) {
  const item = state.slots[state.selected];
  if (!item) return;
  item.offsetX = Math.max(-1, Math.min(1, (Number(item.offsetX) || 0) + x * step));
  item.offsetY = Math.max(-1, Math.min(1, (Number(item.offsetY) || 0) + y * step));
  schedulePreview();
}

function requestCount(target) {
  if (target === state.count) return;
  const removed = state.slots.slice(target).filter(Boolean);
  if (target < state.count && removed.length) {
    openConfirm({
      title: "减少画位？",
      text: `减少到 ${target} 个画位会移除 ${removed.length} 张已添加的图片，是否继续？`,
      label: "继续调整",
      action: () => applyCount(target),
    });
    return;
  }
  applyCount(target);
}

function applyCount(target) {
  target = Math.max(1, Math.min(MAX_IMAGES, target));
  if (target < state.slots.length) {
    state.slots.slice(target).forEach((item) => item?.bitmap?.close());
    state.slots = state.slots.slice(0, target);
    if (state.selected !== null && state.selected >= target) state.selected = null;
  } else {
    while (state.slots.length < target) state.slots.push(null);
  }
  state.count = target;
  closeAllModals();
  renderSlots();
  updateChrome();
  schedulePreview(true);
}

function setLayout(key) {
  if (state.style.layout === key) return;
  state.style.layout = key;
  updateChrome();
  schedulePreview(true);
}

function setAspect(key) {
  if (state.aspect === key) return;
  state.aspect = key;
  updateChrome();
  schedulePreview(true);
}

function setOutputSize(key) {
  if (state.output === key) return;
  state.output = key;
  updateChrome();
  schedulePreview(true);
}

function setFit(fit) {
  if (state.style.fit === fit) return;
  state.style.fit = fit;
  updateChrome();
  schedulePreview(true);
}

function setBackground(color) {
  state.style.background = color;
  updateChrome();
  schedulePreview(true);
}

function resetStyle() {
  state.style = { ...DEFAULT_STYLE };
  state.aspect = "square";
  state.output = "qhd";
  updateChrome();
  schedulePreview(true);
  showToast("样式已恢复默认");
}

function setTab(tab) {
  if (state.activeTab === tab) return;
  state.activeTab = tab;
  $$(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
    button.setAttribute("aria-selected", button.dataset.tab === tab ? "true" : "false");
  });
  $$(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === tab);
  });
  updateTabIndicator();
}

function updateTabIndicator() {
  const tabs = $$(".tab-button");
  const index = Math.max(0, tabs.findIndex((button) => button.classList.contains("active")));
  els.tabIndicator.style.transform = `translateX(${index * 100}%)`;
}

/* -------------------------------------------------------------------------- */
/* Selection & image actions                                                  */
/* -------------------------------------------------------------------------- */

function selectSlot(index) {
  if (index === null) {
    state.selected = null;
  } else {
    state.selected = index;
  }
  renderSlots();
  updateSelectionTools();
  updatePanControls();
  schedulePreview();
}

function updateSelectionTools() {
  const item = state.selected !== null ? state.slots[state.selected] : null;
  const visible = Boolean(item);
  els.selectionTools.classList.toggle("visible", visible);
  if (!visible) {
    updatePanControls();
    return;
  }
  const shortName = item.name.length > 22 ? `${item.name.slice(0, 19)}…` : item.name;
  els.selectionLabel.textContent = shortName;
  els.moveLeftBtn.disabled = state.selected <= 0;
  els.moveRightBtn.disabled = state.selected >= state.count - 1;
  updatePanControls();
}

function updatePanControls() {
  const item = state.selected !== null ? state.slots[state.selected] : null;
  els.centerImageBtn.disabled = !item;
  els.stageFootText.textContent = item
    ? "拖动画面调整构图 · 方向键微调 · 双击居中"
    : loadedCount()
      ? "所有处理均在本机完成"
      : "添加图片开始创作";
  els.previewCanvas.style.cursor = previewCursor();
}

function moveSelected(direction) {
  if (state.selected === null) return;
  const target = state.selected + direction;
  if (target < 0 || target >= state.count) return;
  const item = state.slots[state.selected];
  state.slots[state.selected] = state.slots[target];
  state.slots[target] = item;
  state.selected = target;
  renderSlots();
  updateSelectionTools();
  schedulePreview(true);
}

function removeSelected() {
  if (state.selected === null) return;
  removeAt(state.selected);
}

function removeAt(index) {
  const item = state.slots[index];
  if (!item) return;
  item.bitmap?.close();
  state.slots[index] = null;
  state.selected = index;
  renderSlots();
  updateSelectionTools();
  updateChrome();
  schedulePreview(true);
}

function replaceSelected() {
  if (state.selected === null || !state.slots[state.selected]) return;
  state.pendingReplace = state.selected;
  els.replaceInput.click();
}

function replaceWithFile(file, index) {
  return (async () => {
    setLoading(true, "正在替换图片…");
    try {
      const item = await createImageItem(file);
      const previous = state.slots[index];
      previous?.bitmap?.close();
      state.slots[index] = item;
      state.selected = index;
      renderSlots();
      updateChrome();
      schedulePreview(true);
      showToast("图片已替换");
    } catch (error) {
      console.error(error);
      showToast("无法读取这张图片", 2600, true);
    } finally {
      setLoading(false);
    }
  })();
}

function requestClear() {
  if (!state.slots.some(Boolean)) return;
  openConfirm({
    title: "清空全部图片？",
    text: "所有已添加的图片会从画布中移除，此操作不可撤销。",
    label: "清空",
    action: clearAll,
  });
}

function clearAll() {
  state.slots.forEach((item) => item?.bitmap?.close());
  state.slots = Array(state.count).fill(null);
  state.selected = null;
  renderSlots();
  updateChrome();
  schedulePreview(true);
  showToast("已清空画布");
}

function openFilePicker(targetIndex = null) {
  state.pendingInsert = targetIndex;
  els.fileInput.click();
}

function replaceSelectedWithPicker(index) {
  state.selected = index;
  updateSelectionTools();
  state.pendingReplace = index;
  els.replaceInput.click();
}

/* -------------------------------------------------------------------------- */
/* File loading                                                               */
/* -------------------------------------------------------------------------- */

function isImageFile(file) {
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|bmp|gif|tiff?)$/i.test(file.name || "")
  );
}

async function createImageItem(file) {
  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (error) {
    bitmap = await createImageBitmap(file);
  }
  if (!bitmap || !bitmap.width || !bitmap.height) {
    throw new Error("Empty image");
  }
  const maxSide = 4600;
  const longest = Math.max(bitmap.width, bitmap.height);
  if (longest > maxSide) {
    const ratio = maxSide / longest;
    try {
      const resized = await createImageBitmap(bitmap, {
        resizeWidth: Math.max(1, Math.round(bitmap.width * ratio)),
        resizeHeight: Math.max(1, Math.round(bitmap.height * ratio)),
        resizeQuality: "high",
      });
      bitmap.close();
      bitmap = resized;
    } catch {
      // Safari/WKWebView versions without resize options still work with the
      // full-size bitmap; export simply uses the original resolution.
    }
  }
  const thumb = makeThumbnail(bitmap, 300, 246);
  return {
    id: state.nextId++,
    name: file.name || `图片 ${state.nextId}`,
    type: file.type,
    bitmap,
    thumb,
    offsetX: 0,
    offsetY: 0,
    justAdded: true,
  };
}

async function addFiles(fileList, options = {}) {
  const files = Array.from(fileList).filter(isImageFile);
  if (!files.length) {
    showToast("请选择图片文件", 2200, true);
    return;
  }
  if (state.loading) return;
  setLoading(true, `正在读取 ${files.length} 张图片…`);
  const created = [];
  let failed = 0;
  for (const file of files) {
    try {
      created.push(await createImageItem(file));
    } catch (error) {
      console.warn("Cannot load image", file.name, error);
      failed += 1;
    }
  }
  setLoading(false);
  if (!created.length) {
    showToast("这些图片无法读取，请换用 JPG / PNG / WebP", 3000, true);
    return;
  }

  if (options.replaceIndex !== undefined && options.replaceIndex !== null) {
    const index = options.replaceIndex;
    state.slots[index]?.bitmap?.close();
    state.slots[index] = created[0];
    state.selected = index;
    created.slice(1).forEach((item) => item.bitmap.close());
    renderSlots();
    updateChrome();
    schedulePreview(true);
    showToast("图片已替换");
    if (failed) showToast(`${failed} 张图片无法读取`, 2600, true);
    return;
  }

  let target = Number.isInteger(options.targetIndex) ? options.targetIndex : null;
  if (target !== null && state.slots[target]) target = null;

  // A fresh import defines the slot count from the number of images.
  if (loadedCount() === 0 && target === null) {
    state.slots = Array(Math.min(MAX_IMAGES, created.length)).fill(null);
    state.count = state.slots.length;
  }

  // Grow the number of slots when the user adds more images than the current
  // layout can hold. The final count must fit every existing and new image.
  const required = Math.min(MAX_IMAGES, Math.max(state.slots.length, loadedCount() + created.length));
  while (state.slots.length < required) state.slots.push(null);
  state.count = state.slots.length;

  let current = target;
  let added = 0;
  for (const item of created) {
    if (current === null || current === undefined || state.slots[current]) {
      current = state.slots.indexOf(null);
    }
    if (current === -1) {
      item.bitmap.close();
      continue;
    }
    state.slots[current] = item;
    state.selected = current;
    current = null;
    added += 1;
  }
  state.count = state.slots.length;
  renderSlots();
  updateChrome();
  schedulePreview(true);
  if (added) {
    showToast(`已添加 ${added} 张图片${failed ? `，${failed} 张失败` : ""}`);
  } else {
    showToast("已达到 9 张上限", 2600, true);
  }
}

async function pasteFromClipboard() {
  try {
    if (!navigator.clipboard?.read) throw new Error("Clipboard API unavailable");
    const items = await navigator.clipboard.read();
    const files = [];
    for (const item of items) {
      for (const type of item.types) {
        if (type.startsWith("image/")) {
          const blob = await item.getType(type);
          files.push(
            new File([blob], `剪贴板图片_${Date.now()}.${type.split("/")[1] || "png"}`, {
              type,
            }),
          );
        }
      }
    }
    if (!files.length) {
      showToast("剪贴板里没有图片", 2200, true);
      return;
    }
    await addFiles(files);
  } catch (error) {
    console.warn(error);
    showToast("请按 Ctrl+V 粘贴剪贴板图片", 2400, true);
  }
}

function setLoading(loading, text = "正在读取图片…") {
  state.loading = loading;
  els.loadingTip.hidden = !loading;
  if (loading) {
    els.loadingTip.querySelector("span:last-child").textContent = text;
  }
}

async function loadSamples(silent = false) {
  const load = async () => {
    setLoading(true, "正在载入示例…");
    try {
      const responses = await Promise.all(
        SAMPLE_NAMES.map(async (name) => {
          const response = await fetch(`samples/${name}`, { cache: "no-store" });
          if (!response.ok) throw new Error(`Missing sample ${name}`);
          const blob = await response.blob();
          return new File([blob], name, { type: "image/png" });
        }),
      );
      state.slots.forEach((item) => item?.bitmap?.close());
      state.count = 6;
      state.slots = Array(6).fill(null);
      state.selected = null;
      updateChrome();
      renderSlots();
      setLoading(false);
      await addFiles(responses);
      state.style = { ...DEFAULT_STYLE, layout: "mosaic" };
      state.aspect = "square";
      state.output = "qhd";
      updateChrome();
      schedulePreview(true);
      showToast("示例作品已载入");
    } catch (error) {
      console.error(error);
      setLoading(false);
      showToast("示例图片载入失败", 2800, true);
    }
  };

  if (!silent && state.slots.some(Boolean)) {
    openConfirm({
      title: "载入示例作品？",
      text: "载入示例会替换当前画布中的图片。",
      label: "载入示例",
      action: load,
    });
    return;
  }
  await load();
}

async function maybeLoadDemo() {
  const params = new URLSearchParams(window.location.search);
  if (params.get("demo") === "1") {
    await loadSamples(true);
  }
}

/* -------------------------------------------------------------------------- */
/* Clipboard & drag and drop                                                  */
/* -------------------------------------------------------------------------- */

function bindDragAndDrop() {
  document.addEventListener("dragenter", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    event.preventDefault();
    fileDragDepth = 1;
    els.dropOverlay.classList.add("visible");
  });

  document.addEventListener("dragover", (event) => {
    if (event.dataTransfer?.types?.includes("Files")) {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    }
  });

  document.addEventListener("dragleave", (event) => {
    if (!event.dataTransfer?.types?.includes("Files")) return;
    fileDragDepth = Math.max(0, fileDragDepth - 1);
    const leftWindow =
      event.relatedTarget === null ||
      event.clientX <= 0 ||
      event.clientY <= 0 ||
      event.clientX >= window.innerWidth ||
      event.clientY >= window.innerHeight;
    if (leftWindow || fileDragDepth === 0) {
      fileDragDepth = 0;
      els.dropOverlay.classList.remove("visible");
    }
  });

  document.addEventListener("drop", async (event) => {
    const files = event.dataTransfer?.files;
    if (!files?.length) return;
    event.preventDefault();
    fileDragDepth = 0;
    els.dropOverlay.classList.remove("visible");
    await addFiles(files);
  });

  window.addEventListener("blur", () => {
    fileDragDepth = 0;
    els.dropOverlay.classList.remove("visible");
  });
}

function bindCardDrag(card, index, item) {
  if (item) {
    card.draggable = true;
    card.addEventListener("dragstart", (event) => {
      state.draggingIndex = index;
      card.classList.add("dragging");
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    });
    card.addEventListener("dragend", () => {
      state.draggingIndex = null;
      card.classList.remove("dragging");
      $$(".image-card").forEach((element) => element.classList.remove("drag-over"));
    });
  }
  card.addEventListener("dragover", (event) => {
    if (state.draggingIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    card.classList.add("drag-over");
  });
  card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
  card.addEventListener("drop", (event) => {
    if (state.draggingIndex === null) return;
    event.preventDefault();
    event.stopPropagation();
    const from = state.draggingIndex;
    state.draggingIndex = null;
    moveSlot(from, index);
  });
}

function moveSlot(from, to) {
  if (from === to || from < 0 || to < 0 || from >= state.count || to >= state.count) return;
  const [item] = state.slots.splice(from, 1);
  state.slots.splice(to, 0, item);
  state.selected = to;
  renderSlots();
  updateSelectionTools();
  updateChrome();
  schedulePreview(true);
}

/* -------------------------------------------------------------------------- */
/* Rendering                                                                  */
/* -------------------------------------------------------------------------- */

function renderSlots() {
  els.imageGrid.innerHTML = "";
  state.slots.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "image-card";
    card.dataset.index = String(index);
    card.setAttribute("role", "button");
    card.tabIndex = 0;

    if (item) {
      const newlyAdded = Boolean(item.justAdded);
      card.classList.add("filled");
      if (newlyAdded) card.classList.add("enter");
      card.classList.toggle("selected", state.selected === index);
      card.title = `${item.name} · 拖动缩略图调整顺序`;
      card.setAttribute("aria-label", `${item.name}，拖拽可调整顺序`);
      card.innerHTML = `
        <img src="${item.thumb}" alt="${escapeHtml(item.name)}" draggable="false" />
        <div class="card-shade"></div>
        <span class="card-index">${String(index + 1).padStart(2, "0")}</span>
        <span class="drag-grip" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></span>
        <button class="card-remove" type="button" aria-label="移除图片">
          <svg class="icon"><use href="#i-close"></use></svg>
        </button>
        <span class="card-name">${escapeHtml(item.name)}</span>`;
      card.querySelector(".card-remove").addEventListener("click", (event) => {
        event.stopPropagation();
        removeAt(index);
      });
      card.addEventListener("click", (event) => {
        if (event.target.closest(".card-remove")) return;
        selectSlot(index);
      });
      card.addEventListener("dblclick", (event) => {
        if (event.target.closest(".card-remove")) return;
        selectSlot(index);
        replaceSelected();
      });
      item.justAdded = false;
      if (newlyAdded) setTimeout(() => card.classList.remove("enter"), 450);
    } else {
      card.classList.add("empty-card");
      card.classList.toggle("selected", state.selected === index);
      card.innerHTML = "<span>添加图片</span>";
      card.addEventListener("click", () => openFilePicker(index));
    }
    bindCardDrag(card, index, item);

    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        if (item) selectSlot(index);
        else openFilePicker(index);
      }
      if (event.key === "Delete" && item) removeAt(index);
    });

    els.imageGrid.appendChild(card);
  });
  updateSelectionTools();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function schedulePreview(pulse = false) {
  pendingPulse = pendingPulse || pulse;
  if (previewFrame) return;
  previewFrame = requestAnimationFrame(() => {
    previewFrame = null;
    drawPreview(pendingPulse);
    pendingPulse = false;
  });
}

function drawPreview(pulse = false) {
  const bounds = els.stage.getBoundingClientRect();
  const maxWidth = Math.max(220, bounds.width - (window.innerWidth < 1320 ? 82 : 116));
  const maxHeight = Math.max(220, bounds.height - 84);
  const dimensions = outputDimensions(state.aspect, currentEdge());
  const images = state.slots.map((item) => item?.bitmap || null);
  const offsets = state.slots.map((item) => ({
    x: Number(item?.offsetX) || 0,
    y: Number(item?.offsetY) || 0,
  }));
  lastPreview = renderPreview(
    els.previewCanvas,
    images,
    maxWidth,
    maxHeight,
    state.style,
    dimensions.width,
    dimensions.height,
    Math.min(2, window.devicePixelRatio || 1),
    { offsets, selectedIndex: state.selected ?? -1 },
  );
  els.previewCanvas.style.cursor = previewCursor();
  if (pulse) {
    els.previewShell.classList.remove("pulse");
    void els.previewShell.offsetWidth;
    els.previewShell.classList.add("pulse");
    setTimeout(() => els.previewShell.classList.remove("pulse"), 480);
  }
}

function drawFullscreen() {
  const bounds = els.fullscreenModal.getBoundingClientRect();
  const maxWidth = Math.max(260, bounds.width - 120);
  const maxHeight = Math.max(260, bounds.height - 150);
  const dimensions = outputDimensions(state.aspect, currentEdge());
  renderPreview(
    els.fullscreenCanvas,
    state.slots.map((item) => item?.bitmap || null),
    maxWidth,
    maxHeight,
    state.style,
    dimensions.width,
    dimensions.height,
    Math.min(2, window.devicePixelRatio || 1),
    {
      offsets: state.slots.map((item) => ({
        x: Number(item?.offsetX) || 0,
        y: Number(item?.offsetY) || 0,
      })),
      selectedIndex: -1,
    },
  );
  els.fullscreenDims.textContent = `${dimensions.width} × ${dimensions.height} px`;
}

/* -------------------------------------------------------------------------- */
/* Chrome                                                                     */
/* -------------------------------------------------------------------------- */

function currentEdge() {
  return (OUTPUT_SIZES.find((size) => size.key === state.output) || OUTPUT_SIZES[2]).edge;
}

function currentAspect() {
  return ASPECTS.find((aspect) => aspect.key === state.aspect) || ASPECTS[0];
}

function loadedCount() {
  return state.slots.filter(Boolean).length;
}

function updateChrome() {
  const loaded = loadedCount();
  const dimensions = outputDimensions(state.aspect, currentEdge());
  const aspect = currentAspect();
  const ratio = aspectRatio(state.aspect);

  els.imageCount.textContent = `${loaded} / ${state.count}`;
  els.topSummary.textContent = loaded ? `${loaded} 张图片` : `${state.count} 个画位`;
  els.statusCenter.textContent = `${loaded} 张图片 · ${state.count} 个画位 · ${dimensions.width} × ${dimensions.height} px`;
  els.stageDims.textContent = `${dimensions.width} × ${dimensions.height} px`;
  els.stageAspect.textContent = `${aspect.label} ${aspect.name}`;
  els.stageSize.textContent = `${currentEdge()} px`;
  els.stageStatus.textContent = loaded ? "实时渲染" : "等待素材";
  els.stageCaption.classList.toggle("hidden", loaded > 0);
  els.exportNote.textContent = `${loaded} 张图片 · ${dimensions.width} × ${dimensions.height}`;
  els.outputDims.textContent = `${dimensions.width} × ${dimensions.height}`;
  els.ratioMeta.textContent = `${aspect.w} : ${aspect.h}`;
  els.exportDims.textContent = `${dimensions.width} × ${dimensions.height} px`;
  els.exportCount.textContent = `${loaded} 张图片`;
  els.qualityRange.value = String(state.quality);
  els.qualityValue.textContent = `${state.quality}%`;
  paintRange(els.qualityRange);

  $$(".count-chip").forEach((chip) => {
    chip.classList.toggle("active", Number(chip.dataset.count) === state.count);
  });
  $$(".layout-option").forEach((option) => {
    option.classList.toggle("active", option.dataset.layout === state.style.layout);
  });
  $$(".ratio-option").forEach((option) => {
    option.classList.toggle("active", option.dataset.aspect === state.aspect);
  });
  $$(".size-option").forEach((option) => {
    option.classList.toggle("active", option.dataset.size === state.output);
  });
  $$("#fitSegment .segment").forEach((segment) => {
    segment.classList.toggle("active", segment.dataset.fit === state.style.fit);
  });

  els.borderToggle.checked = state.style.borderEnabled;
  els.borderSliders.classList.toggle("disabled", !state.style.borderEnabled);
  ["borderWidth", "gap", "radius"].forEach((key) => {
    const input = els[key];
    const output = els[`${key}Value`];
    input.value = String(state.style[key]);
    output.textContent = `${state.style[key]} px`;
    paintRange(input);
  });
  els.colorCode.textContent = state.style.background.toUpperCase();

  const preset = SWATCHES.some(
    (color) => color.toUpperCase() === state.style.background.toUpperCase(),
  );
  $$(".swatch[data-color]").forEach((swatch) => {
    swatch.classList.toggle(
      "active",
      swatch.dataset.color.toUpperCase() === state.style.background.toUpperCase(),
    );
  });
  const custom = $(".swatch.custom", els.swatchRow);
  if (custom) custom.classList.toggle("active", !preset);
  const customInput = $("#customColor", els.swatchRow);
  if (customInput) customInput.value = normalizeHex(state.style.background);
  updateExportFormat();
  updateSelectionTools();
  saveSettings();
}

function normalizeHex(color) {
  const hex = color.replace("#", "");
  if (hex.length === 3) {
    return `#${hex.split("").map((char) => char + char).join("")}`;
  }
  return `#${hex.slice(0, 6)}`;
}

function paintRange(input) {
  const min = Number(input.min || 0);
  const max = Number(input.max || 100);
  const value = Number(input.value);
  const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
  input.style.setProperty("--percent", `${percent}%`);
}

/* -------------------------------------------------------------------------- */
/* Modals                                                                     */
/* -------------------------------------------------------------------------- */

function openModal(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.add("open");
  element.setAttribute("aria-hidden", "false");
}

function closeModal(id) {
  const element = document.getElementById(id);
  if (!element) return;
  element.classList.remove("open");
  element.setAttribute("aria-hidden", "true");
}

function closeAllModals() {
  $$(".modal-layer.open").forEach((element) => {
    element.classList.remove("open");
    element.setAttribute("aria-hidden", "true");
  });
}

function openConfirm({ title, text, label, action }) {
  els.confirmTitle.textContent = title;
  els.confirmText.textContent = text;
  els.confirmBtn.textContent = label;
  state.confirmAction = action;
  openModal("confirmModal");
}

function openExportModal() {
  const loaded = loadedCount();
  if (!loaded) {
    showToast("请先添加图片再导出", 2200, true);
    return;
  }
  if (loaded < state.count) {
    showToast(`还有 ${state.count - loaded} 个画位没有图片`, 2600, true);
    return;
  }
  const dimensions = outputDimensions(state.aspect, currentEdge());
  els.exportDims.textContent = `${dimensions.width} × ${dimensions.height} px`;
  els.exportCount.textContent = `${loaded} 张图片`;
  if (els.exportPathInput) els.exportPathInput.value = state.exportDir || "";
  updateExportFormat();
  openModal("exportModal");
}

function updateExportFormat() {
  $$(".format-card").forEach((card) => {
    card.classList.toggle("active", card.dataset.format === state.format);
  });
  els.qualityRow.classList.toggle("hidden", state.format === "png");
}

/* -------------------------------------------------------------------------- */
/* Fullscreen preview                                                         */
/* -------------------------------------------------------------------------- */

function openFullscreen() {
  openModal("fullscreenModal");
  requestAnimationFrame(() => requestAnimationFrame(drawFullscreen));
}

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

async function startExport() {
  const loaded = loadedCount();
  if (loaded < state.count || loaded === 0) {
    closeModal("exportModal");
    showToast("请先补全所有画位", 2600, true);
    return;
  }
  closeModal("exportModal");

  const dimensions = outputDimensions(state.aspect, currentEdge());
  const format = FORMATS[state.format];
  const fileName = `拼图_${timestamp()}.${format.ext}`;
  const api = await getApi();

  // The path field is editable; its default is the program's Exports folder.
  // Protected destinations are written by the same exe's elevated helper.
  if (!state.exportDir && api?.get_export_dir) {
    try {
      state.exportDir = await api.get_export_dir();
      saveSettings();
    } catch (error) {
      console.warn("Cannot resolve export directory", error);
    }
  }
  const targetPath = state.exportDir
    ? `${state.exportDir.replace(/[\\/]+$/, "")}\\${fileName}`
    : null;

  els.exportProgress.hidden = false;
  els.progressText.textContent = `正在生成 ${dimensions.width} × ${dimensions.height} ${format.label}`;
  await nextFrame();

  const canvas = document.createElement("canvas");
  try {
    renderExport(
      canvas,
      state.slots.map((item) => item.bitmap),
      dimensions.width,
      dimensions.height,
      state.style,
      state.slots.map((item) => ({
        x: Number(item?.offsetX) || 0,
        y: Number(item?.offsetY) || 0,
      })),
    );
    const blob = await canvasToBlob(
      canvas,
      format.mime,
      state.format === "png" ? undefined : state.quality / 100,
    );
    const dataUrl = await blobToDataUrl(blob);

    let result = null;
    if (targetPath && api?.write_image) {
      result = await api.write_image(dataUrl, targetPath);
    } else if (api?.save_image) {
      result = await api.save_image(dataUrl, fileName, format.ext, true);
    }

    if (result) {
      if (result.canceled) {
        showToast("已取消导出", 2000);
      } else if (result.ok) {
        if (result.fallback) {
          showToast(`目标目录不可写，已改存到：${result.path || result.name}`, 6000);
        } else {
          showToast(`已导出：${result.path || result.name}`, 5000);
        }
        if (api.open_export_folder) {
          try {
            await api.open_export_folder(result.path || result.name);
          } catch (openError) {
            console.warn("Cannot open export folder", openError);
          }
        }
      } else {
        throw new Error(result.error || "保存失败");
      }
    } else {
      downloadBlob(blob, fileName);
      showToast("作品已下载", 2600);
    }
  } catch (error) {
    console.error(error);
    showToast(`导出失败：${errorText(error)}`, 4200, true);
  } finally {
    canvas.width = 1;
    canvas.height = 1;
    els.exportProgress.hidden = true;
  }
}

function errorText(error) {
  if (error && typeof error === "object" && error.message) return String(error.message);
  if (typeof error === "string" && error) return error;
  try {
    const text = JSON.stringify(error);
    if (text && text !== "{}") return text;
  } catch {
    // ignore non-serializable values
  }
  return "未知错误";
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error("读取导出数据失败"));
    reader.readAsDataURL(blob);
  });
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function getApi() {
  if (window.__pingtuTauriApi) return Promise.resolve(window.__pingtuTauriApi);
  if (!apiPromise) {
    apiPromise = new Promise((resolve) => {
      if (window.pywebview?.api) {
        resolve(window.pywebview.api);
        return;
      }
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve(window.pywebview?.api || null);
      };
      window.addEventListener("pywebviewready", finish, { once: true });
      setTimeout(finish, 1200);
    });
  }
  return apiPromise;
}

/* -------------------------------------------------------------------------- */
/* Feedback                                                                   */
/* -------------------------------------------------------------------------- */

function showToast(message, duration = 2600, error = false) {
  if (toastTimer) clearTimeout(toastTimer);
  els.toastText.textContent = message;
  els.toast.classList.toggle("error", Boolean(error));
  els.toast.classList.add("visible");
  toastTimer = setTimeout(() => {
    els.toast.classList.remove("visible");
  }, duration);
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

window.__pingtuDemo = () => loadSamples(true);
window.__pingtuState = () => ({
  count: state.count,
  loaded: loadedCount(),
  selected: state.selected,
  selectedOffset:
    state.selected !== null && state.slots[state.selected]
      ? {
          x: Number(state.slots[state.selected].offsetX) || 0,
          y: Number(state.slots[state.selected].offsetY) || 0,
        }
      : null,
  style: { ...state.style },
  aspect: state.aspect,
  output: state.output,
  dimensions: outputDimensions(state.aspect, currentEdge()),
});
window.__pingtuPreviewInfo = () => lastPreview;
let nativeBridgeCalled = false;

function notifyNativeReady() {
  if (IS_TAURI) return;
  const call = () => {
    try {
      if (window.location.protocol === "http:") {
        fetch("/ready", { cache: "no-store", keepalive: true }).catch(() => {});
        // A plain image request is an extra same-origin beacon in case fetch
        // is unavailable or blocked by the WebView profile.
        const beacon = new Image();
        beacon.src = `/ready?beacon=${Date.now()}`;
      }
    } catch {
      // Browser preview: no native signal endpoint.
    }
    if (nativeBridgeCalled) return;
    nativeBridgeCalled = true;
    try {
      const result = window.pywebview?.api?.ui_ready?.();
      if (result?.catch) result.catch(() => {});
    } catch {
      // Browser preview: no native bridge present.
    }
  };
  if (window.pywebview?.api) {
    call();
  } else {
    window.addEventListener("pywebviewready", call, { once: true });
    setTimeout(call, 1500);
  }
}

init();
window.__pingtuReady = true;
// Signal immediately after init.  Timers and requestAnimationFrame can both be
// throttled while another window overlaps the app, so do not depend on them for
// the first native-ready notification.
notifyNativeReady();
const bootScreen = document.getElementById("bootScreen");
if (bootScreen) {
  requestAnimationFrame(() => {
    setTimeout(() => bootScreen.classList.add("done"), 40);
    setTimeout(() => bootScreen.remove(), 280);
  });
}
