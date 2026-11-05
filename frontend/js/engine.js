/**
 * Collage layout engine.
 *
 * The renderer is intentionally UI-agnostic: it receives normalized layout
 * units from this module and paints them into a canvas.
 */

export const LAYOUTS = [
  { key: "grid", title: "智能网格", subtitle: "自动平衡行数与列数" },
  { key: "row", title: "横向拼接", subtitle: "所有图片横向排成一行" },
  { key: "column", title: "纵向拼接", subtitle: "所有图片纵向排成一列" },
  { key: "hero", title: "主次混排", subtitle: "一张主图搭配若干小图" },
  { key: "mosaic", title: "杂志拼贴", subtitle: "错落有致的故事感" },
];

export const ASPECTS = [
  { key: "square", label: "1:1", name: "方形", w: 1, h: 1 },
  { key: "landscape", label: "4:3", name: "横向", w: 4, h: 3 },
  { key: "portrait", label: "3:4", name: "竖向", w: 3, h: 4 },
  { key: "classic", label: "5:4", name: "经典横", w: 5, h: 4 },
  { key: "classicPortrait", label: "4:5", name: "经典竖", w: 4, h: 5 },
  { key: "photo", label: "3:2", name: "照片", w: 3, h: 2 },
  { key: "portrait23", label: "2:3", name: "人像", w: 2, h: 3 },
  { key: "wide", label: "16:9", name: "宽屏", w: 16, h: 9 },
  { key: "tall", label: "9:16", name: "竖屏", w: 9, h: 16 },
  { key: "panorama", label: "2:1", name: "全景", w: 2, h: 1 },
  { key: "tall12", label: "1:2", name: "长竖", w: 1, h: 2 },
];

export const OUTPUT_SIZES = [
  { key: "web", label: "1080", name: "轻巧", edge: 1080 },
  { key: "hd", label: "1440", name: "高清", edge: 1440 },
  { key: "qhd", label: "2048", name: "超清", edge: 2048 },
  { key: "2k", label: "2560", name: "2K", edge: 2560 },
  { key: "4k", label: "3840", name: "4K", edge: 3840 },
];

const EPS = 1e-6;

function clampRect(x0, y0, x1, y1) {
  return [
    Math.max(0, x0),
    Math.max(0, y0),
    Math.min(1, x1),
    Math.min(1, y1),
  ];
}

function balancedRows(count, rows) {
  rows = Math.max(1, Math.min(rows, count));
  const base = Math.floor(count / rows);
  const extra = count % rows;
  return Array.from({ length: rows }, (_, index) => base + (index < extra ? 1 : 0));
}

function gridInRegion(count, region, cols) {
  if (count <= 0) return [];
  const [rx0, ry0, rx1, ry1] = region;
  cols = Math.max(1, Math.min(cols, count));
  const rows = Math.ceil(count / cols);
  const counts = balancedRows(count, rows);
  const rowHeight = (ry1 - ry0) / rows;
  const cells = [];
  counts.forEach((rowCount, row) => {
    const cellWidth = (rx1 - rx0) / rowCount;
    const y0 = ry0 + row * rowHeight;
    const y1 = y0 + rowHeight;
    for (let col = 0; col < rowCount; col += 1) {
      const x0 = rx0 + col * cellWidth;
      const x1 = x0 + cellWidth;
      cells.push(clampRect(x0, y0, x1, y1));
    }
  });
  return cells;
}

function gridUnits(n, width, height) {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2) {
    if (width >= height) {
      return [[0, 0, 0.5, 1], [0.5, 0, 1, 1]];
    }
    return [[0, 0, 1, 0.5], [0, 0.5, 1, 1]];
  }
  let best = null;
  for (let cols = 1; cols <= n; cols += 1) {
    const rows = Math.ceil(n / cols);
    if (rows > n) continue;
    const cellAspect = width / cols / (height / rows);
    const holes = Math.max(0, cols * rows - n);
    let orientationBonus = 0;
    if (width >= height && cols >= rows) orientationBonus = 0.1;
    else if (width < height && rows >= cols) orientationBonus = 0.1;
    const score =
      Math.abs(Math.log(Math.max(0.01, cellAspect))) +
      (holes / n) * 0.22 -
      orientationBonus;
    if (!best || score < best.score - EPS) best = { score, cols };
  }
  return gridInRegion(n, [0, 0, 1, 1], best.cols);
}

function subGrid(count, region, forceCols = null) {
  if (count <= 0) return [];
  const [rx0, ry0, rx1, ry1] = region;
  const rw = rx1 - rx0;
  const rh = ry1 - ry0;
  let cols = forceCols;
  if (!cols) {
    let best = null;
    for (let c = 1; c <= count; c += 1) {
      const rows = Math.ceil(count / c);
      const aspect = rw / c / (rh / rows);
      const holes = c * rows - count;
      const score = Math.abs(Math.log(Math.max(0.01, aspect))) + holes * 0.12;
      if (!best || score < best.score - EPS) best = { score, cols: c };
    }
    cols = best.cols;
  }
  return gridInRegion(count, region, Math.max(1, Math.min(cols, count)));
}

function heroUnits(n, width, height) {
  if (n <= 1) return [[0, 0, 1, 1]];
  const landscape = width >= height;
  const primaryRatio = n === 2 ? 0.64 : 0.61;
  if (landscape) {
    const primary = [0, 0, primaryRatio, 1];
    const restCount = n - 1;
    const rest = subGrid(
      restCount,
      [primaryRatio, 0, 1, 1],
      restCount <= 3 ? 1 : 2,
    );
    return [primary, ...rest];
  }
  const primary = [0, 0, 1, primaryRatio];
  const restCount = n - 1;
  const rest = subGrid(
    restCount,
    [0, primaryRatio, 1, 1],
    restCount <= 3 ? restCount : Math.min(4, restCount),
  );
  return [primary, ...rest];
}

function mosaicUnits(n) {
  if (n <= 1) return [[0, 0, 1, 1]];
  if (n === 2) return [[0, 0, 0.62, 1], [0.62, 0, 1, 1]];
  if (n === 3) {
    return [
      [0, 0, 0.66, 1],
      [0.66, 0, 1, 0.5],
      [0.66, 0.5, 1, 1],
    ];
  }
  if (n === 4) {
    return [
      [0, 0, 0.62, 1],
      [0.62, 0, 1, 1 / 3],
      [0.62, 1 / 3, 1, 2 / 3],
      [0.62, 2 / 3, 1, 1],
    ];
  }
  if (n === 5) {
    return [
      [0, 0, 1, 0.62],
      [0, 0.62, 0.5, 0.81],
      [0.5, 0.62, 1, 0.81],
      [0, 0.81, 0.5, 1],
      [0.5, 0.81, 1, 1],
    ];
  }
  const b = [2 / 3, 0, 1, 1 / 3];
  const c = [2 / 3, 1 / 3, 1, 2 / 3];
  const d = [0, 2 / 3, 1 / 3, 1];
  const e = [1 / 3, 2 / 3, 2 / 3, 1];
  const f = [2 / 3, 2 / 3, 1, 1];
  if (n === 6) {
    return [
      [0, 0, 2 / 3, 2 / 3],
      b,
      c,
      d,
      e,
      f,
    ];
  }
  if (n === 7) {
    return [
      [0, 0, 2 / 3, 1 / 3],
      [0, 1 / 3, 2 / 3, 2 / 3],
      b,
      c,
      d,
      e,
      f,
    ];
  }
  if (n === 8) {
    return [
      [0, 0, 0.55, 0.6],
      [0.55, 0, 1, 0.2],
      [0.55, 0.2, 1, 0.4],
      [0.55, 0.4, 1, 0.6],
      [0, 0.6, 0.25, 1],
      [0.25, 0.6, 0.5, 1],
      [0.5, 0.6, 0.75, 1],
      [0.75, 0.6, 1, 1],
    ];
  }
  return [
    [0, 0, 1 / 3, 1 / 3],
    [1 / 3, 0, 2 / 3, 1 / 3],
    [0, 1 / 3, 1 / 3, 2 / 3],
    [1 / 3, 1 / 3, 2 / 3, 2 / 3],
    b,
    c,
    d,
    e,
    f,
  ];
}

export function layoutUnits(layout, count, width, height) {
  count = Math.max(1, count);
  if (layout === "row") {
    return Array.from({ length: count }, (_, i) => [i / count, 0, (i + 1) / count, 1]);
  }
  if (layout === "column") {
    return Array.from({ length: count }, (_, i) => [0, i / count, 1, (i + 1) / count]);
  }
  if (layout === "hero") return heroUnits(count, width, height);
  if (layout === "mosaic") return mosaicUnits(count);
  return gridUnits(count, width, height);
}

export function computeLayout(
  layout,
  count,
  width,
  height,
  { borderWidth = 0, gap = 0 } = {},
) {
  if (width <= 0 || height <= 0) return [];
  const border = Math.max(0, Math.min(borderWidth, Math.min(width, height) / 3));
  const gapValue = Math.max(0, Math.min(gap, Math.min(width, height) / 4));
  const innerW = Math.max(1, width - border * 2);
  const innerH = Math.max(1, height - border * 2);
  const units = layoutUnits(layout, count, innerW, innerH);
  return units.map(([x0, y0, x1, y1]) => {
    const left = border + x0 * innerW;
    const top = border + y0 * innerH;
    const right = border + x1 * innerW;
    const bottom = border + y1 * innerH;
    const insetL = x0 > EPS ? gapValue / 2 : 0;
    const insetT = y0 > EPS ? gapValue / 2 : 0;
    const insetR = x1 < 1 - EPS ? gapValue / 2 : 0;
    const insetB = y1 < 1 - EPS ? gapValue / 2 : 0;
    const x = Math.round(left + insetL);
    const y = Math.round(top + insetT);
    return {
      x,
      y,
      w: Math.max(1, Math.round(right - insetR) - x),
      h: Math.max(1, Math.round(bottom - insetB) - y),
    };
  });
}

export function outputDimensions(aspectKey, longEdge) {
  const aspect = ASPECTS.find((item) => item.key === aspectKey) || ASPECTS[0];
  let width;
  let height;
  if (aspect.w >= aspect.h) {
    width = longEdge;
    height = Math.round((longEdge * aspect.h) / aspect.w);
  } else {
    height = longEdge;
    width = Math.round((longEdge * aspect.w) / aspect.h);
  }
  // Keep even dimensions for cleaner JPEG output.
  width += width % 2;
  height += height % 2;
  return { width, height };
}

export function aspectRatio(aspectKey) {
  const aspect = ASPECTS.find((item) => item.key === aspectKey) || ASPECTS[0];
  return aspect.w / aspect.h;
}
