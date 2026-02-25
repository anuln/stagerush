import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

function toIndex(x, y, width) {
  return y * width + x;
}

function toOffset(index) {
  return index * 4;
}

function colorDistanceSq(a, b) {
  const dr = a.r - b.r;
  const dg = a.g - b.g;
  const db = a.b - b.b;
  return dr * dr + dg * dg + db * db;
}

function quantizeChannel(value, step) {
  return Math.max(0, Math.min(255, Math.round(value / step) * step));
}

function isBorderPixel(x, y, width, height) {
  return x === 0 || y === 0 || x === width - 1 || y === height - 1;
}

export function analyzeAlpha(data) {
  let transparentPixels = 0;
  let semiTransparentPixels = 0;
  let opaquePixels = 0;
  for (let i = 3; i < data.length; i += 4) {
    const alpha = data[i];
    if (alpha <= 10) {
      transparentPixels += 1;
    } else if (alpha >= 245) {
      opaquePixels += 1;
    } else {
      semiTransparentPixels += 1;
    }
  }
  return {
    transparentPixels,
    semiTransparentPixels,
    opaquePixels,
    totalPixels: transparentPixels + semiTransparentPixels + opaquePixels
  };
}

export function collectBorderPalette(data, width, height, options = {}) {
  const quantizeStep = options.quantizeStep ?? 8;
  const maxColors = options.maxColors ?? 8;
  const counts = new Map();

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isBorderPixel(x, y, width, height)) {
        continue;
      }
      const index = toIndex(x, y, width);
      const offset = toOffset(index);
      const alpha = data[offset + 3];
      if (alpha <= 10) {
        continue;
      }
      const key = [
        quantizeChannel(data[offset], quantizeStep),
        quantizeChannel(data[offset + 1], quantizeStep),
        quantizeChannel(data[offset + 2], quantizeStep)
      ].join(",");
      const current = counts.get(key);
      if (current) {
        current.count += 1;
        current.r += data[offset];
        current.g += data[offset + 1];
        current.b += data[offset + 2];
      } else {
        counts.set(key, {
          count: 1,
          r: data[offset],
          g: data[offset + 1],
          b: data[offset + 2]
        });
      }
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((value) => ({
      r: Math.round(value.r / value.count),
      g: Math.round(value.g / value.count),
      b: Math.round(value.b / value.count)
    }));
}

function isNearPaletteColor(r, g, b, palette, toleranceSq) {
  for (const candidate of palette) {
    if (colorDistanceSq({ r, g, b }, candidate) <= toleranceSq) {
      return true;
    }
  }
  return false;
}

function hasTransparentNeighbor(alphaData, width, height, x, y) {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1]
  ];
  for (const [nx, ny] of neighbors) {
    if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
      continue;
    }
    if (alphaData[toOffset(toIndex(nx, ny, width)) + 3] <= 10) {
      return true;
    }
  }
  return false;
}

export function stripEdgeBackground(data, width, height, options = {}) {
  const palette = collectBorderPalette(data, width, height, options);
  if (palette.length === 0) {
    return { data, clearedPixels: 0, softenedPixels: 0, palette };
  }

  const tolerance = options.tolerance ?? 34;
  const softTolerance = options.softTolerance ?? 26;
  const maxSoftAlpha = options.maxSoftAlpha ?? 96;
  const toleranceSq = tolerance * tolerance;
  const softToleranceSq = softTolerance * softTolerance;

  const out = new Uint8ClampedArray(data);
  const visited = new Uint8Array(width * height);
  const queue = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!isBorderPixel(x, y, width, height)) {
        continue;
      }
      const index = toIndex(x, y, width);
      const offset = toOffset(index);
      if (out[offset + 3] <= 10) {
        continue;
      }
      if (
        isNearPaletteColor(
          out[offset],
          out[offset + 1],
          out[offset + 2],
          palette,
          toleranceSq
        )
      ) {
        visited[index] = 1;
        queue.push(index);
      }
    }
  }

  let clearedPixels = 0;
  while (queue.length > 0) {
    const current = queue.pop();
    const x = current % width;
    const y = Math.floor(current / width);
    const offset = toOffset(current);
    if (out[offset + 3] > 10) {
      out[offset + 3] = 0;
      clearedPixels += 1;
    }

    const neighbors = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1]
    ];
    for (const [nx, ny] of neighbors) {
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      const next = toIndex(nx, ny, width);
      if (visited[next] === 1) {
        continue;
      }
      const nextOffset = toOffset(next);
      if (out[nextOffset + 3] <= 10) {
        continue;
      }
      if (
        !isNearPaletteColor(
          out[nextOffset],
          out[nextOffset + 1],
          out[nextOffset + 2],
          palette,
          toleranceSq
        )
      ) {
        continue;
      }
      visited[next] = 1;
      queue.push(next);
    }
  }

  let softenedPixels = 0;
  if (softTolerance > 0) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = toIndex(x, y, width);
        const offset = toOffset(index);
        const alpha = out[offset + 3];
        if (alpha <= 10) {
          continue;
        }
        if (!hasTransparentNeighbor(out, width, height, x, y)) {
          continue;
        }
        if (
          !isNearPaletteColor(
            out[offset],
            out[offset + 1],
            out[offset + 2],
            palette,
            softToleranceSq
          )
        ) {
          continue;
        }
        out[offset + 3] = Math.min(alpha, maxSoftAlpha);
        softenedPixels += 1;
      }
    }
  }

  return { data: out, clearedPixels, softenedPixels, palette };
}

export async function readImageRGBA(filePath) {
  const image = sharp(filePath).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  return {
    data: new Uint8ClampedArray(data),
    width: info.width,
    height: info.height
  };
}

export async function writeImageRGBA(filePath, data, width, height) {
  const tempPath = `${filePath}.tmp`;
  await sharp(Buffer.from(data), {
    raw: { width, height, channels: 4 }
  })
    .png({ compressionLevel: 9, palette: false })
    .toFile(tempPath);
  fs.renameSync(tempPath, filePath);
}

export async function processTransparentSprite(filePath, options = {}) {
  const { data, width, height } = await readImageRGBA(filePath);
  const before = analyzeAlpha(data);
  const cleaned = stripEdgeBackground(data, width, height, options);
  const after = analyzeAlpha(cleaned.data);
  const changed =
    cleaned.clearedPixels > 0 ||
    cleaned.softenedPixels > 0 ||
    before.transparentPixels !== after.transparentPixels ||
    before.semiTransparentPixels !== after.semiTransparentPixels;

  if (changed) {
    await writeImageRGBA(filePath, cleaned.data, width, height);
  }

  return {
    filePath,
    width,
    height,
    changed,
    before,
    after,
    clearedPixels: cleaned.clearedPixels,
    softenedPixels: cleaned.softenedPixels
  };
}

export function ensureFileDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}
