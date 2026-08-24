import { copyFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const defaultOutputDirectory = resolve(scriptDirectory, '..', 'dist')
const outputDirectory = resolve(process.argv[2] ?? defaultOutputDirectory)

await copyFile(
  resolve(outputDirectory, 'index.html'),
  resolve(outputDirectory, '404.html'),
)
