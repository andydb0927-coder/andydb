import type {
  LibTvCatalog,
  LibTvCatalogProject,
  LibTvModelSummary,
} from '../../src/features/generation/libtv-contract.js'

import type { CliRunner } from './types.js'

export async function loadLibTvCatalog(
  runner: CliRunner,
  writesEnabled: boolean,
): Promise<LibTvCatalog> {
  let cliVersion: string
  try {
    const version = await runner.run(['--version'])
    cliVersion = version.stdout.trim()
    if (!cliVersion) {
      throw new Error('empty version')
    }
  } catch {
    return unavailableCatalog(writesEnabled, false)
  }

  try {
    const account = parseJson((await runner.run(['account', 'info'])).stdout)
    const projects = parseProjects(
      parseJson((await runner.run(['project', 'list', '-p', '1', '-s', '50'])).stdout),
    )
    const imageModels = parseModels(
      parseJson((await runner.run(['model', 'search', '--type', 'image'])).stdout),
    )
    const videoModels = parseModels(
      parseJson((await runner.run(['model', 'search', '--type', 'video'])).stdout),
    )

    return {
      cliInstalled: true,
      cliVersion,
      authenticated: readBoolean(account, 'authenticated'),
      writesEnabled,
      projects,
      imageModels,
      videoModels,
    }
  } catch {
    return unavailableCatalog(writesEnabled, true, cliVersion)
  }
}

function unavailableCatalog(
  writesEnabled: boolean,
  cliInstalled: boolean,
  cliVersion?: string,
): LibTvCatalog {
  return {
    cliInstalled,
    ...(cliVersion ? { cliVersion } : {}),
    authenticated: false,
    writesEnabled,
    projects: [],
    imageModels: [],
    videoModels: [],
    error: 'LibTV CLI is unavailable',
  }
}

function parseJson(stdout: string): unknown {
  return JSON.parse(stdout) as unknown
}

function parseProjects(payload: unknown): LibTvCatalogProject[] {
  return readArray(payload, 'projects').flatMap((project) => {
    const uuid = readString(project, 'uuid')
    const name = readString(project, 'name')
    return uuid && name ? [{ uuid, name }] : []
  })
}

function parseModels(payload: unknown): LibTvModelSummary[] {
  return readArray(payload, 'models').flatMap((model) => {
    const modelKey = readString(model, 'modelKey')
    const modelName = readString(model, 'modelName')
    if (!modelKey || !modelName) {
      return []
    }
    return [
      {
        modelKey,
        modelName,
        ...optionalString(model, 'description'),
        ...optionalString(model, 'estimatedTime'),
        ...optionalString(model, 'pricingRule'),
        ...optionalBoolean(model, 'vip'),
      },
    ]
  })
}

function readArray(payload: unknown, key: string): unknown[] {
  if (!isRecord(payload)) {
    return []
  }
  const value = payload[key]
  return Array.isArray(value) ? value : []
}

function readString(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) {
    return undefined
  }
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
}

function readBoolean(payload: unknown, key: string): boolean {
  return isRecord(payload) && payload[key] === true
}

function optionalString(payload: unknown, key: string): Record<string, string> {
  const value = readString(payload, key)
  return value === undefined ? {} : { [key]: value }
}

function optionalBoolean(payload: unknown, key: string): Record<string, boolean> {
  if (!isRecord(payload) || typeof payload[key] !== 'boolean') {
    return {}
  }
  return { [key]: payload[key] }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
