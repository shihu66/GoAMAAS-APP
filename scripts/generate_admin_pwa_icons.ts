import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/**
 * Deterministic zero-dependency PNG generator for GoAMAAS Admin PWA icons.
 * Produces valid RGBA PNG files with anti-aliased AMAAS Technologies shield geometry:
 * - public/admin-pwa-192x192.png (192x192, purpose: "any")
 * - public/admin-pwa-512x512.png (512x512, purpose: "any")
 * - public/admin-pwa-maskable-512x512.png (512x512, purpose: "maskable" with 16% safe-zone margin)
 * - public/admin-apple-touch-icon.png (180x180, iOS touch icon)
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // standard filter
  ihdr[12] = 0; // non-interlaced

  const stride = width * 4;
  const rawScanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    rawScanlines[rowStart] = 0; // Filter type 0 (None)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      rawScanlines,
      rowStart + 1
    );
  }

  const compressed = zlib.deflateSync(rawScanlines, { level: 9 });

  return Buffer.concat([
    signature,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function roundedRectSdf(
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
  radius: number
): number {
  const qx = Math.abs(px - cx) - halfW + radius;
  const qy = Math.abs(py - cy) - halfH + radius;
  const outDist = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const inDist = Math.min(Math.max(qx, qy), 0);
  return outDist + inDist - radius;
}

function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const lenSq = vx * vx + vy * vy;
  const t = lenSq > 0 ? clamp((wx * vx + wy * vy) / lenSq, 0, 1) : 0;
  return Math.hypot(px - (ax + t * vx), py - (ay + t * vy));
}

function shieldSdf(nx: number, ny: number): number {
  // Normalized coordinates centered at (0, 0), shield spans roughly [-0.30, 0.30] x [-0.34, 0.36]
  const ax = Math.abs(nx);
  if (ny < -0.32) {
    return Math.hypot(Math.max(ax - 0.27, 0), -0.32 - ny);
  }
  // Upper straight/gently tapered sides from y = -0.32 to y = 0.02
  if (ny <= 0.02) {
    const t = (ny + 0.32) / 0.34;
    const halfWidth = 0.285 - 0.015 * t;
    const dyTop = ny + 0.32;
    return Math.max(ax - halfWidth, -dyTop);
  }
  // Lower curved shield tip converging cleanly to (0, 0.35)
  const t = clamp((ny - 0.02) / 0.33, 0, 1.3);
  if (ny > 0.35) {
    return Math.hypot(ax, ny - 0.35);
  }
  const halfWidth = 0.27 * Math.pow(1 - t, 0.78);
  return (ax - halfWidth) * 0.85;
}

function blendPixel(
  buf: Uint8Array,
  idx: number,
  r: number,
  g: number,
  b: number,
  alpha: number
) {
  const a = clamp(alpha, 0, 1);
  if (a <= 0) return;
  const inv = 1 - a;
  const dstA = buf[idx + 3] / 255;
  const outA = a + dstA * inv;
  if (outA <= 0) return;
  buf[idx] = Math.round((r * a + buf[idx] * dstA * inv) / outA);
  buf[idx + 1] = Math.round((g * a + buf[idx + 1] * dstA * inv) / outA);
  buf[idx + 2] = Math.round((b * a + buf[idx + 2] * dstA * inv) / outA);
  buf[idx + 3] = Math.round(outA * 255);
}

function renderAdminIcon(size: number, options: { maskable: boolean; fullBleedSquare?: boolean }): Buffer {
  const rgba = new Uint8Array(size * size * 4);
  const aa = 1.35 / size;
  // Maskable keeps all foreground emblem geometry inside central 70% circle (>15% safe padding on all sides)
  const emblemScale = options.maskable ? 0.76 : 0.94;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const u = (x + 0.5) / size - 0.5;
      const v = (y + 0.5) / size - 0.5;

      // Background card (full bleed for maskable/iOS, crisp squircle for standard any icon)
      let bgAlpha = 1;
      if (!options.maskable && !options.fullBleedSquare) {
        const dBg = roundedRectSdf(u, v, 0, 0, 0.465, 0.465, 0.11);
        bgAlpha = clamp(0.5 - dBg / aa, 0, 1);
      }

      if (bgAlpha <= 0) continue;

      // Subtle deep navy radial/diagonal finish (#090D16 -> #111B30)
      const grad = clamp(0.5 - (u * 0.65 + v * 0.85), 0, 1);
      const bgR = Math.round(9 + grad * 10);
      const bgG = Math.round(13 + grad * 16);
      const bgB = Math.round(22 + grad * 28);
      rgba[idx] = bgR;
      rgba[idx + 1] = bgG;
      rgba[idx + 2] = bgB;
      rgba[idx + 3] = Math.round(bgAlpha * 255);

      // Subtle inner border ring on non-maskable icon
      if (!options.maskable && !options.fullBleedSquare) {
        const dBorder = Math.abs(roundedRectSdf(u, v, 0, 0, 0.455, 0.455, 0.105)) - 0.004;
        const borderAlpha = clamp(0.5 - dBorder / aa, 0, 1) * 0.32 * bgAlpha;
        blendPixel(rgba, idx, 59, 130, 246, borderAlpha);
      }

      // Shield coordinates scaled for safe zone
      const sx = u / emblemScale;
      const sy = v / emblemScale;
      const dShield = shieldSdf(sx, sy);

      // Outer royal blue shield (#1D4ED8 -> #2563EB)
      const shieldAlpha = clamp(0.5 - dShield / (aa / emblemScale), 0, 1) * bgAlpha;
      if (shieldAlpha > 0) {
        const sGrad = clamp(0.55 - sy * 1.1, 0, 1);
        const sR = Math.round(24 + sGrad * 19);
        const sG = Math.round(68 + sGrad * 42);
        const sB = Math.round(196 + sGrad * 48);
        blendPixel(rgba, idx, sR, sG, sB, shieldAlpha);
      }

      // Inner dark slate shield core
      const dInnerShield = shieldSdf(sx * 1.18, sy * 1.18);
      const innerAlpha = clamp(0.5 - dInnerShield / (aa / emblemScale), 0, 1) * bgAlpha;
      if (innerAlpha > 0) {
        blendPixel(rgba, idx, 11, 18, 33, innerAlpha * 0.92);
      }

      // Crisp geometric "A" + Checkmark inside the shield (AMAAS Verified Admin mark)
      const strokeW = 0.036;
      const dLeftLeg = distToSegment(sx, sy, -0.105, 0.115, -0.015, -0.135) - strokeW;
      const dRightLeg = distToSegment(sx, sy, -0.015, -0.135, 0.068, 0.09) - strokeW;
      const dCrossbar = distToSegment(sx, sy, -0.072, 0.035, 0.038, 0.035) - strokeW * 0.82;

      const dLetterA = Math.min(dLeftLeg, dRightLeg, dCrossbar);
      const aAlpha = clamp(0.5 - dLetterA / (aa / emblemScale), 0, 1) * bgAlpha;
      if (aAlpha > 0) {
        blendPixel(rgba, idx, 248, 250, 252, aAlpha);
      }

      // Emerald verification check badge at bottom-right of the shield
      const dBadge = Math.hypot(sx - 0.125, sy - 0.125) - 0.098;
      const badgeAlpha = clamp(0.5 - dBadge / (aa / emblemScale), 0, 1) * bgAlpha;
      if (badgeAlpha > 0) {
        blendPixel(rgba, idx, 16, 185, 129, badgeAlpha);
      }

      const dCheck1 = distToSegment(sx, sy, 0.086, 0.126, 0.114, 0.154) - 0.018;
      const dCheck2 = distToSegment(sx, sy, 0.114, 0.154, 0.168, 0.096) - 0.018;
      const checkAlpha =
        clamp(0.5 - Math.min(dCheck1, dCheck2) / (aa / emblemScale), 0, 1) * bgAlpha;
      if (checkAlpha > 0) {
        blendPixel(rgba, idx, 6, 24, 18, checkAlpha);
      }
    }
  }

  return encodePng(size, size, rgba);
}

const publicDir = path.resolve(process.cwd(), 'public');
fs.mkdirSync(publicDir, { recursive: true });

const targets: Array<{ file: string; size: number; maskable: boolean; fullBleedSquare?: boolean }> = [
  { file: 'admin-pwa-192x192.png', size: 192, maskable: false },
  { file: 'admin-pwa-512x512.png', size: 512, maskable: false },
  { file: 'admin-pwa-maskable-512x512.png', size: 512, maskable: true },
  { file: 'admin-apple-touch-icon.png', size: 180, maskable: false, fullBleedSquare: true },
];

for (const target of targets) {
  const pngBuffer = renderAdminIcon(target.size, {
    maskable: target.maskable,
    fullBleedSquare: target.fullBleedSquare,
  });
  const outPath = path.join(publicDir, target.file);
  fs.writeFileSync(outPath, pngBuffer);
  console.log(`Generated ${target.file} (${target.size}x${target.size}, ${pngBuffer.length} bytes)`);
}
