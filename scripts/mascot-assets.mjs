import sharp from "sharp"
import { writeFile, mkdir } from "node:fs/promises"

const folder = "public/mascot/tally-cat"
const poses = ["welcome", "ready", "thinking", "saving", "celebration", "reassurance", "income", "planning", "backup", "resting", "waiting", "peeking"]
await mkdir(folder + "/runtime", { recursive: true })
for (const pose of poses) {
  await sharp(folder + "/" + pose + ".png")
    .resize(320, 320)
    .webp({ quality: 85 })
    .toFile(folder + "/runtime/" + pose + ".webp")
}
await sharp(folder + "/brandmark.png")
  .resize(96, 96)
  .webp({ quality: 90 })
  .toFile(folder + "/runtime/logo.webp")
const head = await sharp(folder + "/brandmark.png")
  .resize(384, 384)
  .png()
  .toBuffer()
// Keep the face well inside Android's circular maskable safe zone.
await writeFile(
  "public/logo.svg",
  '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0b1426"/><image x="76" y="76" width="360" height="360" href="data:image/png;base64,' +
    head.toString("base64") +
    '"/></svg>'
)
console.log("Generated twelve optimized poses, logo, and maskable-safe app icon source.")
