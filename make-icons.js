// Generates the PNG app icons (green square with a white house and check mark) without dependencies.
const fs = require('fs'), zlib = require('zlib');
function crc32(buf) { let c, crc = ~0; for (const b of buf) { c = (crc ^ b) & 255; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return ~crc >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); }
function icon(size) {
  const S = 4, raw = Buffer.alloc((size * 4 + 1) * size);
  const bg = [31, 111, 82], fg = [255, 255, 255];
  const inside = (x, y) => { // coords in 0..1: house outline with a check mark inside
    const line = (ax, ay, bx, by, w) => { const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy))); return Math.hypot(x - ax - t * vx, y - ay - t * vy) < w; };
    const w = .032;
    if (line(.2, .47, .5, .2, w) || line(.5, .2, .8, .47, w)) return true;   // roof
    if (line(.28, .42, .28, .8, w) || line(.72, .42, .72, .8, w) || line(.28, .8, .72, .8, w)) return true; // walls
    return line(.38, .6, .47, .69, w) || line(.47, .69, .63, .51, w);       // check
  };
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let hit = 0; for (let i = 0; i < S; i++) for (let j = 0; j < S; j++) hit += inside((x + (i + .5) / S) / size, (y + (j + .5) / S) / size);
      const a = hit / (S * S), o = y * (size * 4 + 1) + 1 + x * 4;
      for (let c = 0; c < 3; c++) raw[o + c] = Math.round(bg[c] * (1 - a) + fg[c] * a);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
for (const [n, s] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) fs.writeFileSync(n, icon(s));
