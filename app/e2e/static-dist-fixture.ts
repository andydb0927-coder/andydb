import { statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'

export function resolveOfflineDist(value = process.env.PLAYWRIGHT_OFFLINE_DIST): string {
  // Support the legacy boolean flag as well as an explicit artifact directory.
  return resolve(!value || value === '1' ? 'dist' : value)
}

export function resolveStaticFixtureFile(root: string, pathname: string): string {
  const path = pathname.replace(/^\/andydb(?:\/|$)/, '').replace(/^\/+/, '')
  const target = resolve(root, path)
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('Invalid production fixture path')
  // Deep SPA URLs can also end in .html. Only existing files are assets.
  return extname(path) && statSync(target, { throwIfNoEntry: false })?.isFile()
    ? target
    : resolve(root, 'index.html')
}
