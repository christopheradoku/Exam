import { copyFile, mkdir, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const source = path.join(projectRoot, "node_modules", "@mediapipe", "tasks-vision", "wasm")
const destination = path.join(projectRoot, "public", "mediapipe", "wasm")
const runtimeFiles = (await readdir(source)).filter((name) =>
  /^vision_wasm.*\.(?:js|wasm)$/.test(name),
)

if (!runtimeFiles.some((name) => name.endsWith(".wasm"))) {
  throw new Error("MediaPipe WASM files were not found in @mediapipe/tasks-vision.")
}

await mkdir(destination, { recursive: true })
await Promise.all(runtimeFiles.map((name) => copyFile(path.join(source, name), path.join(destination, name))))
console.log(`Prepared ${runtimeFiles.length} MediaPipe runtime files from the installed package.`)
