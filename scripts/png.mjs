// Minimal PNG decoder (8-bit RGB/RGBA, non-interlaced) for probe scripts. No deps.
import { inflateSync } from 'node:zlib'

export const PNG = {
  decode(buf) {
    let pos = 8
    let width = 0
    let height = 0
    let channels = 4
    const idat = []
    while (pos < buf.length) {
      const len = buf.readUInt32BE(pos)
      const type = buf.toString('ascii', pos + 4, pos + 8)
      const data = buf.subarray(pos + 8, pos + 8 + len)
      if (type === 'IHDR') {
        width = data.readUInt32BE(0)
        height = data.readUInt32BE(4)
        const depth = data[8]
        const color = data[9]
        if (depth !== 8 || data[12] !== 0) throw new Error('png.mjs: only 8-bit non-interlaced PNGs')
        channels = color === 6 ? 4 : color === 2 ? 3 : color === 4 ? 2 : 1
      } else if (type === 'IDAT') idat.push(data)
      else if (type === 'IEND') break
      pos += 12 + len
    }
    const raw = inflateSync(Buffer.concat(idat))
    const stride = width * channels
    const out = new Uint8Array(width * height * 4)
    let prev = new Uint8Array(stride)
    for (let y = 0; y < height; y++) {
      const filter = raw[y * (stride + 1)]
      const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1))
      const cur = new Uint8Array(stride)
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? cur[i - channels] : 0
        const b = prev[i]
        const c = i >= channels ? prev[i - channels] : 0
        let v = line[i]
        if (filter === 1) v += a
        else if (filter === 2) v += b
        else if (filter === 3) v += (a + b) >> 1
        else if (filter === 4) {
          const p = a + b - c
          const pa = Math.abs(p - a)
          const pb = Math.abs(p - b)
          const pc = Math.abs(p - c)
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c
        }
        cur[i] = v & 255
      }
      for (let x = 0; x < width; x++) {
        const o = (y * width + x) * 4
        const s = x * channels
        if (channels >= 3) {
          out[o] = cur[s]
          out[o + 1] = cur[s + 1]
          out[o + 2] = cur[s + 2]
          out[o + 3] = channels === 4 ? cur[s + 3] : 255
        } else {
          out[o] = out[o + 1] = out[o + 2] = cur[s]
          out[o + 3] = channels === 2 ? cur[s + 1] : 255
        }
      }
      prev = cur
    }
    return { width, height, data: out }
  },
}
