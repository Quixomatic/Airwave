import type { GuideGrain } from "./guide-tokens";

/**
 * The guide's repeating textures as pixels, with no react-native imports so bun can load it.
 *
 * Paper grain is a small tile of seeded random specks. `grainTile` makes it, `encodePng` writes it as a PNG and `pngDataUri`
 * wraps that as the `data:` address an `Image` can draw, so the guide needs no image files and no new dependency. The specks come
 * from the same generator as the one the native painter uses, so a token set looks the same in both renderers.
 */

/** A square of RGBA pixels, row by row, 4 bytes each. */
export type Tile = { width: number; height: number; rgba: Uint8Array };

/** Mulberry32: a small seeded generator. The same seed gives the same sequence everywhere, which is what makes a grain tile reproducible. */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hexByte = (hex: string, i: number): number => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);

/**
 * The grain tile: `tile` x `tile` texels, each lit with probability `density`, in one of `colors` at an alpha between 0.45 and 1
 * times `alpha`. `scale` draws every texel as `scale` x `scale` pixels (nearest neighbour, rounded), so the tile can be made at
 * the size it will be shown at and drawn without resampling: a texel is `texel` design px, which is 1.5 pixels or so on a TV.
 * `colors` are `#rrggbb`.
 */
export function grainTile(p: Pick<GuideGrain, "tile" | "density" | "alpha" | "colors" | "seed">, scale = 1): Tile {
  const rnd = mulberry32(p.seed);
  const n = p.tile;
  const texels = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) {
    if (rnd() < p.density) {
      const col = p.colors[Math.floor(rnd() * p.colors.length)]!;
      texels[i * 4] = hexByte(col, 0);
      texels[i * 4 + 1] = hexByte(col, 1);
      texels[i * 4 + 2] = hexByte(col, 2);
      texels[i * 4 + 3] = Math.round(255 * p.alpha * (0.45 + 0.55 * rnd()));
    }
  }
  if (scale === 1) return { width: n, height: n, rgba: texels };
  const size = Math.max(1, Math.round(n * scale));
  // A pixel is copied whole, four bytes as one word (the bytes are not looked at, so the byte order does not matter): this runs on the JS thread
  // for every pixel of the scaled tile, and a view of the source made for each of them was most of its cost.
  const src = new Uint32Array(texels.buffer);
  const out = new Uint32Array(size * size);
  const column = new Uint32Array(size);
  for (let x = 0; x < size; x++) column[x] = Math.min(n - 1, Math.floor(x / scale));
  for (let y = 0; y < size; y++) {
    const row = Math.min(n - 1, Math.floor(y / scale)) * n;
    const to = y * size;
    for (let x = 0; x < size; x++) out[to + x] = src[row + column[x]!]!;
  }
  return { width: size, height: size, rgba: new Uint8Array(out.buffer) };
}

// ---------------------------------------------------------------------------------------------------------------
// PNG: stored (uncompressed) deflate blocks, which every decoder reads, so there is no compressor to ship.
// ---------------------------------------------------------------------------------------------------------------

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array, init = 0xffffffff): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = init;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return c;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  // The modulo is taken once per 5552 bytes, the most that cannot overflow a 32 bit sum (zlib's NMAX), not once per byte.
  for (let start = 0; start < bytes.length; start += 5552) {
    const end = Math.min(bytes.length, start + 5552);
    for (let i = start; i < end; i++) {
      a += bytes[i]!;
      b += a;
    }
    a %= 65521;
    b %= 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number): number[] => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];

/** `data` as a zlib stream of stored blocks (a block holds at most 65535 bytes). */
function zlibStored(data: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(data.length / 65535));
  const out = new Uint8Array(2 + data.length + blocks * 5 + 4);
  let o = 0;
  out[o++] = 0x78;
  out[o++] = 0x01;
  for (let b = 0; b < blocks; b++) {
    const start = b * 65535;
    const len = Math.min(65535, data.length - start);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = len & 255;
    out[o++] = len >>> 8;
    out[o++] = ~len & 255;
    out[o++] = (~len >>> 8) & 255;
    out.set(data.subarray(start, start + len), o);
    o += len;
  }
  out.set(u32(adler32(data)), o);
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  out.set(u32(data.length), 0);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  out.set(u32((crc32(out.subarray(4, 8 + data.length)) ^ 0xffffffff) >>> 0), 8 + data.length);
  return out;
}

/** A tile as an 8-bit RGBA PNG. */
export function encodePng({ width, height, rgba }: Tile): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height); // each row starts with filter type 0 (none)
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * stride, (y + 1) * stride), y * (stride + 1) + 1);
  const header = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlibStored(raw)), chunk("IEND", new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const B64_CODES = Uint8Array.from(B64, (ch) => ch.charCodeAt(0));
const PAD = "=".charCodeAt(0);

/** Standard base64 (with padding). Written out so the result does not depend on the JS engine having `btoa`. The characters are made as codes and turned into text in blocks, not appended one at a time (a tile is some 200 KB of them). */
export function toBase64(bytes: Uint8Array): string {
  const out = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let o = 0;
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out[o++] = B64_CODES[a >> 2]!;
    out[o++] = B64_CODES[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out[o++] = b === undefined ? PAD : B64_CODES[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out[o++] = c === undefined ? PAD : B64_CODES[c & 63]!;
  }
  let s = "";
  for (let i = 0; i < out.length; i += 4096) s += String.fromCharCode(...out.subarray(i, i + 4096));
  return s;
}

/** The `data:` address of a tile's PNG. */
export const pngDataUri = (tile: Tile): string => `data:image/png;base64,${toBase64(encodePng(tile))}`;

/**
 * The entry for `key` in `cache`, made by `make` when there is none, and the cache kept to its `max` most recently asked-for entries:
 * a guide that is restyled over and over (the Settings preview walks every theme and color) must not keep one entry for each look it has
 * ever shown. A Map remembers the order its keys were set in, so the first key is the least recently used.
 */
export function memoLru<K, V>(cache: Map<K, V>, key: K, max: number, make: () => V): V {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }
  const made = make();
  cache.set(key, made);
  while (cache.size > Math.max(1, max)) cache.delete(cache.keys().next().value as K);
  return made;
}
