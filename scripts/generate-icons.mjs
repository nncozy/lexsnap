/**
 * Generates the PWA / favicon PNG assets in `public/` with no external deps.
 * Draws a white "L" on the LexSnap indigo (#4F46E5) background.
 *
 * Run with: npm run icons
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const publicDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')

const BG = [0x4f, 0x46, 0xe5] // indigo
const FG = [0xff, 0xff, 0xff] // white

// CRC32 table for PNG chunk checksums.
const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'latin1')
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

// `draw(u, v)` receives normalized coords in [0, 1] and returns true for the
// foreground (the "L"). `pad` insets the glyph for maskable safe areas.
function makeL(pad) {
  return (u, v) => {
    const lo = pad
    const hi = 1 - pad
    if (u < lo || u > hi || v < lo || v > hi) return false
    const x = (u - lo) / (hi - lo)
    const y = (v - lo) / (hi - lo)
    const vertical = x >= 0.3 && x <= 0.45 && y >= 0.2 && y <= 0.8
    const foot = x >= 0.3 && x <= 0.72 && y >= 0.66 && y <= 0.8
    return vertical || foot
  }
}

function png(size, draw) {
  const raw = Buffer.alloc(size * (1 + size * 3))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const color = draw((x + 0.5) / size, (y + 0.5) / size) ? FG : BG
      const p = rowStart + 1 + x * 3
      raw[p] = color[0]
      raw[p + 1] = color[1]
      raw[p + 2] = color[2]
    }
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // color type: truecolor RGB
  // ihdr[10..12] = compression / filter / interlace = 0

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const assets = [
  ['icon-192.png', 192, makeL(0)],
  ['icon-512.png', 512, makeL(0)],
  ['maskable-512.png', 512, makeL(0.12)],
  ['apple-touch-icon.png', 180, makeL(0.08)],
]

for (const [name, size, draw] of assets) {
  writeFileSync(join(publicDir, name), png(size, draw))
  console.log(`generated public/${name}`)
}
