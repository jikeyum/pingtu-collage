import { computeLayout } from "./engine.js";

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(Math.max(0, radius), width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function parseColor(color) {
  const hex = color.replace("#", "");
  const value = hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex;
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function luminance(color) {
  const [r, g, b] = parseColor(color);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function clamp(value, minimum = -1, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

/**
 * Canvas drawImage is fast but Chromium's direct large downscale is softer
 * than Photoshop's bicubic/Lanczos pass. For big reductions, pre-render the
 * cropped source at 2x the destination size, then do one final high-quality
 * downscale. This preserves more edge contrast in collage exports.
 */
function drawCropped(ctx, image, sx, sy, sw, sh, dx, dy, dw, dh, highQuality) {
  if (highQuality) {
    const ratio = Math.max(sw / Math.max(1, dw), sh / Math.max(1, dh));
    if (ratio > 1.7) {
      let current = image;
      let currentSx = sx;
      let currentSy = sy;
      let currentW = sw;
      let currentH = sh;
      // Halve repeatedly while far above the final pixel grid. Each step is
      // a small, high-quality reduction instead of one blurry giant sample.
      while (
        currentW > dw * 3 &&
        currentH > dh * 3
      ) {
        const nextW = Math.max(1, Math.round(currentW / 2));
        const nextH = Math.max(1, Math.round(currentH / 2));
        const half = document.createElement("canvas");
        half.width = nextW;
        half.height = nextH;
        const halfCtx = half.getContext("2d");
        halfCtx.imageSmoothingEnabled = true;
        halfCtx.imageSmoothingQuality = "high";
        halfCtx.drawImage(
          current,
          currentSx,
          currentSy,
          currentW,
          currentH,
          0,
          0,
          nextW,
          nextH,
        );
        current = half;
        currentSx = 0;
        currentSy = 0;
        currentW = nextW;
        currentH = nextH;
      }
      const tempWidth = Math.max(1, Math.round(dw * 2));
      const tempHeight = Math.max(1, Math.round(dh * 2));
      const temp = document.createElement("canvas");
      temp.width = tempWidth;
      temp.height = tempHeight;
      const tempCtx = temp.getContext("2d");
      tempCtx.imageSmoothingEnabled = true;
      tempCtx.imageSmoothingQuality = "high";
      tempCtx.drawImage(
        current,
        currentSx,
        currentSy,
        currentW,
        currentH,
        0,
        0,
        tempWidth,
        tempHeight,
      );
      ctx.drawImage(temp, 0, 0, tempWidth, tempHeight, dx, dy, dw, dh);
      return;
    }
  }
  ctx.drawImage(image, sx, sy, sw, sh, dx, dy, dw, dh);
}

/**
 * Lightweight unsharp mask applied once to the final export canvas. It
 * restores the micro-contrast that a browser's rescale tends to soften,
 * without changing color, geometry, or PNG losslessness.
 */
function applyUnsharpMask(canvas, amount = 0.30, radius = 1) {
  const width = canvas.width;
  const height = canvas.height;
  if (!width || !height || width * height > 24_000_000) return;
  const ctx = canvas.getContext("2d");
  const blurred = document.createElement("canvas");
  blurred.width = width;
  blurred.height = height;
  const blurredCtx = blurred.getContext("2d");
  if (!("filter" in blurredCtx)) return;
  blurredCtx.filter = `blur(${radius}px)`;
  blurredCtx.drawImage(canvas, 0, 0);
  blurredCtx.filter = "none";
  const source = ctx.getImageData(0, 0, width, height);
  const soft = blurredCtx.getImageData(0, 0, width, height);
  const a = source.data;
  const b = soft.data;
  for (let i = 0; i < a.length; i += 4) {
    a[i] = Math.max(0, Math.min(255, a[i] + amount * (a[i] - b[i])));
    a[i + 1] = Math.max(0, Math.min(255, a[i + 1] + amount * (a[i + 1] - b[i + 1])));
    a[i + 2] = Math.max(0, Math.min(255, a[i + 2] + amount * (a[i + 2] - b[i + 2])));
  }
  ctx.putImageData(source, 0, 0);
}

function drawCover(ctx, image, x, y, width, height, offsetX = 0, offsetY = 0, highQuality = false) {
  const scale = Math.max(width / image.width, height / image.height);
  const sourceWidth = Math.min(image.width, width / scale);
  const sourceHeight = Math.min(image.height, height / scale);
  const spareWidth = Math.max(0, image.width - sourceWidth);
  const spareHeight = Math.max(0, image.height - sourceHeight);
  const sourceX = spareWidth / 2 - clamp(offsetX) * (spareWidth / 2);
  const sourceY = spareHeight / 2 - clamp(offsetY) * (spareHeight / 2);
  drawCropped(
    ctx,
    image,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    x,
    y,
    width,
    height,
    highQuality,
  );
}

function drawContain(ctx, image, x, y, width, height, background, offsetX = 0, offsetY = 0, highQuality = false) {
  const scale = Math.min(width / image.width, height / image.height);
  const drawWidth = image.width * scale;
  const drawHeight = image.height * scale;
  const spareX = Math.max(0, (width - drawWidth) / 2);
  const spareY = Math.max(0, (height - drawHeight) / 2);
  const drawX = x + (width - drawWidth) / 2 + clamp(offsetX) * spareX;
  const drawY = y + (height - drawHeight) / 2 + clamp(offsetY) * spareY;
  ctx.fillStyle = background;
  ctx.fillRect(x, y, width, height);
  drawCropped(ctx, image, 0, 0, image.width, image.height, drawX, drawY, drawWidth, drawHeight, highQuality);
}

function drawMissing(ctx, rect, style, scale) {
  const lightBackground = luminance(style.background) > 150;
  const stroke = lightBackground ? "rgba(55, 62, 78, 0.20)" : "rgba(255, 255, 255, 0.28)";
  const fill = lightBackground ? "#F1EDE7" : "rgba(255, 255, 255, 0.055)";
  const ink = lightBackground ? "rgba(55, 62, 78, 0.40)" : "rgba(255, 255, 255, 0.52)";
  const radius = Math.min(style.radius * scale, rect.w / 2, rect.h / 2);
  roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, Math.min(rect.w, rect.h) * 0.004);
  ctx.stroke();

  const size = Math.min(rect.w * 0.20, rect.h * 0.26, 86 * scale + 22);
  if (size > 16) {
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2 - size * 0.05;
    const iconW = size;
    const iconH = size * 0.7;
    ctx.strokeStyle = ink;
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.lineJoin = "round";
    roundedRect(
      ctx,
      cx - iconW / 2,
      cy - iconH / 2,
      iconW,
      iconH,
      Math.max(3, size * 0.08),
    );
    ctx.stroke();
    ctx.fillStyle = ink;
    ctx.beginPath();
    ctx.arc(cx - iconW * 0.22, cy - iconH * 0.20, Math.max(1.2, size * 0.05), 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - iconW * 0.40, cy + iconH * 0.28);
    ctx.lineTo(cx - iconW * 0.06, cy - iconH * 0.08);
    ctx.lineTo(cx + iconW * 0.10, cy + iconH * 0.14);
    ctx.lineTo(cx + iconW * 0.28, cy - iconH * 0.04);
    ctx.lineTo(cx + iconW * 0.42, cy + iconH * 0.28);
    ctx.stroke();
  }
}

export function prepareCanvas(canvas, cssWidth, cssHeight, dpr = 1) {
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  canvas.style.width = `${Math.round(cssWidth)}px`;
  canvas.style.height = `${Math.round(cssHeight)}px`;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

function drawSelection(ctx, rect) {
  const radius = Math.min(9, rect.w / 2, rect.h / 2);
  const inset = 2;
  ctx.save();
  ctx.shadowColor = "rgba(255, 103, 70, 0.72)";
  ctx.shadowBlur = 10;
  ctx.strokeStyle = "#ff6746";
  ctx.lineWidth = 2.5;
  roundedRect(
    ctx,
    rect.x + inset,
    rect.y + inset,
    Math.max(1, rect.w - inset * 2),
    Math.max(1, rect.h - inset * 2),
    radius,
  );
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
  ctx.lineWidth = 1;
  roundedRect(
    ctx,
    rect.x + inset + 2,
    rect.y + inset + 2,
    Math.max(1, rect.w - inset * 2 - 4),
    Math.max(1, rect.h - inset * 2 - 4),
    Math.max(0, radius - 2),
  );
  ctx.stroke();
  ctx.restore();
}

/**
 * Paint a collage into a canvas using an already scaled style.
 */
export function paintCollage(ctx, images, width, height, style, offsets = [], highQuality = false) {
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = style.background;
  ctx.fillRect(0, 0, width, height);
  const border = style.borderEnabled ? style.borderWidth : 0;
  const rects = computeLayout(style.layout, Math.max(1, images.length), width, height, {
    borderWidth: border,
    gap: style.gap,
  });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  rects.forEach((rect, index) => {
    const image = images[index];
    if (!image) {
      drawMissing(ctx, rect, style, 1);
      return;
    }
    const offset = offsets[index] || {};
    const offsetX = Number(offset.x) || 0;
    const offsetY = Number(offset.y) || 0;
    const radius = Math.min(style.radius, rect.w / 2, rect.h / 2);
    ctx.save();
    roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, radius);
    ctx.clip();
    if (style.fit === "contain") {
      drawContain(
        ctx,
        image,
        rect.x,
        rect.y,
        rect.w,
        rect.h,
        style.background,
        offsetX,
        offsetY,
        highQuality,
      );
    } else {
      drawCover(ctx, image, rect.x, rect.y, rect.w, rect.h, offsetX, offsetY, highQuality);
    }
    ctx.restore();
  });
  return rects;
}

export function renderPreview(
  canvas,
  images,
  maxWidth,
  maxHeight,
  style,
  outputWidth,
  outputHeight,
  dpr = window.devicePixelRatio || 1,
  options = {},
) {
  const scale = Math.min(maxWidth / outputWidth, maxHeight / outputHeight);
  const cssWidth = Math.max(180, Math.round(outputWidth * scale));
  const cssHeight = Math.max(180, Math.round(outputHeight * scale));
  const actualScale = cssWidth / outputWidth;
  const ctx = prepareCanvas(canvas, cssWidth, cssHeight, dpr);
  const scaledStyle = {
    ...style,
    borderWidth: Math.round(style.borderWidth * actualScale),
    gap: Math.round(style.gap * actualScale),
    radius: Math.round(style.radius * actualScale),
  };
  const rects = paintCollage(
    ctx,
    images,
    cssWidth,
    cssHeight,
    scaledStyle,
    options.offsets || [],
  );
  if (
    Number.isInteger(options.selectedIndex) &&
    options.selectedIndex >= 0 &&
    rects[options.selectedIndex]
  ) {
    drawSelection(ctx, rects[options.selectedIndex]);
  }
  return {
    width: cssWidth,
    height: cssHeight,
    scale: actualScale,
    rects,
  };
}

export function renderExport(canvas, images, width, height, style, offsets = []) {
  const ctx = prepareCanvas(canvas, width, height, 1);
  paintCollage(ctx, images, width, height, style, offsets, true);
  applyUnsharpMask(canvas);
  return ctx;
}

export function makeThumbnail(image, width = 280, height = 210) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.save();
  roundedRect(ctx, 0, 0, width, height, 18);
  ctx.clip();
  drawCover(ctx, image, 0, 0, width, height);
  ctx.restore();
  return canvas.toDataURL("image/jpeg", 0.86);
}

export function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("无法生成图片数据"))),
      mimeType,
      quality,
    );
  });
}

export function dataUrlToUint8(dataUrl) {
  const base64 = dataUrl.split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
