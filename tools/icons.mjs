// Generates the PWA icons and the Open Graph image as PNG, with no image library: pixels are painted
// in code and encoded with Node's zlib. Run with `npm run icons`; outputs land in public/.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const OUT = path.resolve('public');

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const INDIGO = [28, 24, 64];
const MAGENTA = [214, 36, 120];
const SAFFRON = [246, 146, 30];
const GOLD = [250, 196, 64];
const PAPER = [246, 240, 226];

/** A fighter kite: diamond, eye print, bamboo spine and bow; returns colour or null at (u, v) in kite space. */
function kiteAt(u, v) {
  const d = Math.abs(u) + Math.abs(v);
  if (d > 1) return null;
  let c = v > 0 ? MAGENTA : SAFFRON;
  const r = Math.hypot(u, v - 0.05);
  if (r < 0.42) c = GOLD;
  if (r < 0.32) c = PAPER;
  if (r < 0.16) c = INDIGO;
  if (Math.abs(u) < 0.025 || Math.abs(v - (0.25 + 0.35 * (1 - u * u))) < 0.025) c = mix(c, [60, 40, 30], 0.6);
  return mix(c, [0, 0, 0], smooth(0.9, 1, d) * 0.35);
}

function paint(width, height, scene) {
  const buf = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const c = scene((x + 0.5) / width, (y + 0.5) / height);
      const i = (y * width + x) * 4;
      buf[i] = Math.round(c[0]);
      buf[i + 1] = Math.round(c[1]);
      buf[i + 2] = Math.round(c[2]);
      buf[i + 3] = c[3] ?? 255;
    }
  }
  return buf;
}

/** The icon: a kite against a dusk sky, its string curving down to the corner. */
function icon(size, safe) {
  const scale = safe ? 0.62 : 0.78;
  return paint(size, size, (x, y) => {
    const sky = mix(mix(GOLD, MAGENTA, smooth(0.95, 0.45, y)), INDIGO, smooth(0.55, 0.0, y));
    const u = (x - 0.5) / (0.38 * scale);
    const v = (0.47 - y) / (0.44 * scale);
    const kite = kiteAt(u, v);
    if (kite) return [...kite, 255];
    // The string from the kite's bridle to the bottom-right corner.
    const sx = 0.5 + (x - 0.5);
    const curve = 0.47 + 0.44 * scale * 0.95 + (sx - 0.5) * (sx - 0.5) * 0.9;
    if (x > 0.5 && Math.abs(y - curve) < 0.006) return [...PAPER, 255];
    return [...sky, 255];
  });
}

/** The Open Graph card: dusk over a jagged roofline with kites. */
function ogImage() {
  const w = 1200;
  const h = 630;
  const kites = [
    [0.68, 0.28, 0.11],
    [0.3, 0.2, 0.05],
    [0.82, 0.12, 0.04],
    [0.18, 0.4, 0.035],
    [0.5, 0.1, 0.03],
  ];
  return paint(w, h, (x, y) => {
    const sky = mix(mix(GOLD, MAGENTA, smooth(0.95, 0.5, y)), INDIGO, smooth(0.6, 0.0, y));
    const sun = Math.hypot((x - 0.7) * 1.9, y - 0.78);
    let c = mix(sky, [255, 236, 190], smooth(0.12, 0.0, sun));
    for (const [kx, ky, ks] of kites) {
      const k = kiteAt((x - kx) / ks, (ky - y) / (ks * 1.9));
      if (k) c = k;
    }
    // Rooftops: blocks of varying height with water tanks.
    const col = Math.floor(x * 38);
    const roof = 0.7 + ((0.12 * (((Math.sin(col * 12.9898) * 43758.5453) % 1) + 1)) % 1) * 0.9;
    const tank = Math.abs(((x * 38) % 1) - 0.5) < 0.12 && y > roof - 0.035;
    if (y > roof || tank) c = mix([34, 22, 44], [60, 34, 54], smooth(1, roof, y));
    return [...c, 255];
  });
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, 192, icon(192, false)));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, 512, icon(512, false)));
fs.writeFileSync(path.join(OUT, 'icon-maskable-512.png'), png(512, 512, icon(512, true)));
fs.writeFileSync(path.join(OUT, 'og-image.png'), png(1200, 630, ogImage()));
console.info('icons written to public/');
