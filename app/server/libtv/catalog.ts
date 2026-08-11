import type {
  LibTvCatalog,
  LibTvCatalogProject,
  LibTvModelSummary,
} from '../../src/features/generation/libtv-contract.js'

import type { CliRunner } from './types.js'

const SEMVER_PATTERN =
  /^v?(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

class CatalogResponseError extends Error {}

export async function loadLibTvCatalog(
  runner: CliRunner,
  writesEnabled: boolean,
): Promise<LibTvCatalog> {
  let versionStdout: string
  try {
    versionStdout = (await runner.run(['--version'])).stdout
  } catch {
    return failedCatalog(writesEnabled, false, undefined, 'LibTV CLI is unavailable')
  }

  const cliVersion = parseCliVersion(versionStdout)
  if (!cliVersion) {
    return failedCatalog(
      writesEnabled,
      true,
      undefined,
      'LibTV CLI version response is invalid',
    )
  }

  try {
    const account = await runJson(runner, ['account', 'info'], 'LibTV account response is invalid')
    const projects = parseProjects(
      await runJson(
        runner,
        ['project', 'list', '-p', '1', '-s', '50'],
        'LibTV project response is invalid',
      ),
    )
    const imageModels = parseModels(
      await runJson(
        runner,
        ['model', 'search', '--type', 'image'],
        'LibTV image model response is invalid',
      ),
      'LibTV image model response is invalid',
    )
    const videoModels = parseModels(
      await runJson(
        runner,
        ['model', 'search', '--type', 'video'],
        'LibTV video model response is invalid',
      ),
      'LibTV video model response is invalid',
    )

    return {
      cliInstalled: true,
      cliVersion,
      authenticated: parseAuthenticated(account),
      writesEnabled,
      projects,
      imageModels,
      videoModels,
    }
  } catch (error) {
    return failedCatalog(writesEnabled, true, cliVersion, safeCatalogError(error))
  }
}

function failedCatalog(
  writesEnabled: boolean,
  cliInstalled: boolean,
  cliVersion: string | undefined,
  error: string,
): LibTvCatalog {
  return {
    cliInstalled,
    ...(cliVersion ? { cliVersion } : {}),
    authenticated: false,
    writesEnabled,
    projects: [],
    imageModels: [],
    videoModels: [],
    error,
  }
}

function parseCliVersion(stdout: string): string | undefined {
  const candidate = stdout.trim()
  if (!SEMVER_PATTERN.test(candidate)) {
    return undefined
  }
  return candidate.startsWith('v') ? candidate.slice(1) : candidate
}

async function runJson(
  runner: CliRunner,
  args: readonly string[],
  invalidResponseError: string,
): Promise<unknown> {
  const { stdout } = await runner.run(args)
  try {
    return JSON.parse(stdout) as unknown
  } catch {
    throw new CatalogResponseError(invalidResponseError)
  }
}

function parseAuthenticated(payload: unknown): boolean {
  if (
    !isRecord(payload) ||
    !('user' in payload) ||
    (payload.user !== null && !isRecord(payload.user))
  ) {
    throw new CatalogResponseError('LibTV account response is invalid')
  }
  return payload.user !== null
}

function parseProjects(payload: unknown): LibTvCatalogProject[] {
  return requiredArray(payload, 'projectMetaList', 'LibTV project response is invalid').flatMap(
    (project) => {
      const uuid = readString(project, 'uuid')
      const name = readString(project, 'name')
      return uuid && name ? [{ uuid, name }] : []
    },
  )
}

function parseModels(payload: unknown, invalidResponseError: string): LibTvModelSummary[] {
  return requiredArray(payload, 'matches', invalidResponseError).flatMap((model) => {
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

function requiredArray(payload: unknown, key: string, error: string): unknown[] {
  if (!isRecord(payload) || !Array.isArray(payload[key])) {
    throw new CatalogResponseError(error)
  }
  return payload[key]
}

function readString(payload: unknown, key: string): string | undefined {
  if (!isRecord(payload)) {
    return undefined
  }
  const value = payload[key]
  return typeof value === 'string' ? value : undefined
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

function safeCatalogError(error: unknown): string {
  return error instanceof CatalogResponseError
    ? error.message
    : 'LibTV CLI is unavailable'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
