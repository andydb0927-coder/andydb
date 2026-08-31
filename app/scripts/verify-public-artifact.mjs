import { readdir, readFile } from 'node:fs/promises'
import { extname, relative, resolve } from 'node:path'

const outputDirectory = resolve(process.argv[2] ?? 'dist')
const readableExtensions = new Set(['.css', '.html', '.js', '.json', '.map', '.svg', '.txt'])
const sensitiveClientKeys = [
  'VITE_SEEDREAM_API_KEY',
  'VITE_ARK_TTS_API_KEY',
  'VITE_KLING_API_KEY',
  'VITE_BACKEND_INVITE_CODE',
  'VITE_CODE_KEY',
]
const forbiddenLiterals = [
  'replace-with-account-enabled-endpoint-id',
  'ANDY2026',
  'WXHB2026',
]

async function listFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true })
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name)
    return entry.isDirectory() ? listFiles(path) : [path]
  }))
  return files.flat()
}

const violations = []
const files = (await listFiles(outputDirectory)).filter((file) => readableExtensions.has(extname(file)))

for (const file of files) {
  const content = await readFile(file, 'utf8')
  const artifactPath = relative(outputDirectory, file)

  for (const key of sensitiveClientKeys) {
    const nonEmptyAssignment = new RegExp(`["']?${key}["']?\\s*:\\s*["']([^"']+)["']`, 'u')
    if (nonEmptyAssignment.test(content)) violations.push(`${key} in ${artifactPath}`)
  }

  for (const literal of forbiddenLiterals) {
    if (content.includes(literal)) violations.push(`forbidden placeholder in ${artifactPath}`)
  }
}

if (violations.length > 0) {
  throw new Error(`[public-artifact] sensitive configuration detected: ${violations.join(', ')}`)
}

console.log(`[public-artifact] checked ${files.length} text assets; no sensitive client configuration found`)
