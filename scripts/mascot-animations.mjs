import sharp from "sharp"
import { mkdir, writeFile } from "node:fs/promises"
const configs = { idle: [4, 2], wave: [5, 2], working: [4, 3], success: [4, 3] }
const chosen = process.argv.slice(2)
const names = chosen.length ? chosen : Object.keys(configs)
const output = "public/mascot/tally-cat/animation"
await mkdir(output, { recursive: true })
for (const name of names) {
  const [cols, rows] = configs[name]
  const source = "docs/mascot/animation-sources/" + name + ".png"
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const tiles = []
  const bounds = (left, top, width, height) => {
    let x0 = width,
      y0 = height,
      x1 = -1,
      y1 = -1
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++)
        if (data[((top + y) * info.width + left + x) * 4 + 3] > 48) {
          x0 = Math.min(x0, x)
          x1 = Math.max(x1, x)
          y0 = Math.min(y0, y)
          y1 = Math.max(y1, y)
        }
    if (x1 < 0) throw new Error("Empty animation cell: " + name)
    return { x0, y0, x1: x1 + 1, y1: y1 + 1 }
  }
  const rowSplits = [0]
  for (let r = 1; r < rows; r++) {
    const expected = Math.floor((r * info.height) / rows),
      range = Math.floor((info.height / rows) * 0.22)
    let best = expected,
      bestCount = Infinity
    for (let y = expected - range; y <= expected + range; y++) {
      let count = 0
      for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 48) count++
      if (count < bestCount || (count === bestCount && Math.abs(y - expected) < Math.abs(best - expected))) {
        best = y
        bestCount = count
      }
    }
    if (bestCount > 3) throw new Error("Sprites overlap between rows: " + name)
    rowSplits.push(best)
  }
  rowSplits.push(info.height)
  for (let row = 0; row < rows; row++) {
    const top = rowSplits[row],
      height = rowSplits[row + 1] - top
    const splits = [0]
    for (let c = 1; c < cols; c++) {
      const expected = Math.floor((c * info.width) / cols),
        range = Math.floor((info.width / cols) * 0.18)
      let best = expected,
        bestCount = Infinity
      for (let x = expected - range; x <= expected + range; x++) {
        let count = 0
        for (let y = top; y < top + height; y++) if (data[(y * info.width + x) * 4 + 3] > 48) count++
        if (count < bestCount || (count === bestCount && Math.abs(x - expected) < Math.abs(best - expected))) {
          best = x
          bestCount = count
        }
      }
      if (bestCount > 3 && name !== "idle") throw new Error("Sprites overlap at split: " + name + " " + row + " " + c)
      splits.push(best)
    }
    splits.push(info.width)
    for (let col = 0; col < cols; col++) {
      const left = splits[col],
        width = splits[col + 1] - left,
        b = bounds(left, top, width, height)
      const head = bounds(left, top + b.y0, width, Math.max(1, Math.floor((b.y1 - b.y0) * 0.45)))
      tiles.push({ left, top, width, height, b, anchor: (head.x0 + head.x1) / 2 })
    }
  }
  // Two idle source cells touch; reuse clean neutral cells for the tail return.
  if (name === "idle") {
    tiles[5] = tiles[1]
    tiles[6] = tiles[0]
  }
  const scale = Math.min(
    168 / Math.max(...tiles.map((t) => t.b.y1 - t.b.y0)),
    168 / Math.max(...tiles.map((t) => t.b.x1 - t.b.x0)),
    84 / Math.max(...tiles.map((t) => t.anchor - t.b.x0)),
    84 / Math.max(...tiles.map((t) => t.b.x1 - t.anchor))
  )
  const frames = []
  for (const t of tiles) {
    const w = Math.max(1, Math.round((t.b.x1 - t.b.x0) * scale)),
      h = Math.max(1, Math.round((t.b.y1 - t.b.y0) * scale))
    const x = Math.round(96 - (t.anchor - t.b.x0) * scale),
      y = 180 - h
    if (x < 0 || x + w > 192 || y < 0) throw new Error("Registered frame would clip: " + name)
    const png = await sharp(source)
      .extract({ left: t.left + t.b.x0, top: t.top + t.b.y0, width: t.b.x1 - t.b.x0, height: t.b.y1 - t.b.y0 })
      .resize(w, h)
      .png()
      .toBuffer()
    frames.push(
      await sharp({ create: { width: 192, height: 192, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
        .composite([{ input: png, left: x, top: y }])
        .png()
        .toBuffer()
    )
  }
  await sharp({ create: { width: 192 * frames.length, height: 192, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(frames.map((input, i) => ({ input, left: i * 192, top: 0 })))
    .webp({ quality: 55, alphaQuality: 80, effort: 6 })
    .toFile(output + "/" + name + ".webp")
  await writeFile("docs/mascot/animation-sources/" + name + "-registration.json", JSON.stringify({ frames: frames.length, frameSize: 192, scale, tiles }, null, 2))
  console.log(name + ": " + frames.length + " aligned 192px frames")
}
