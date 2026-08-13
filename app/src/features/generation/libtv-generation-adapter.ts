import type {
  GenerationAdapter,
  GenerationReference,
  GenerationRequest,
  GenerationResult,
} from './generation-adapter'
import type { GenerationProviderPreferenceStore } from './generation-provider-preference'
import {
  LIBTV_PROJECT_UUID_PATTERN,
  type LibTvCatalog,
  type LibTvCatalogProject,
  type LibTvModelSummary,
  type LibTvProviderSelection,
} from './libtv-contract'

const MAX_REFERENCES = 3
const MAX_REFERENCE_BYTES = 20 * 1024 * 1024
const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const MIME_KINDS = {
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/webm': 'video',
} as const

type SupportedMimeType = keyof typeof MIME_KINDS

interface FetchLibTvCatalogOptions {
  fetch?: typeof fetch
  signal?: AbortSignal
}

export interface LibTvGenerationAdapterOptions {
  preferenceStore: GenerationProviderPreferenceStore
  fetch?: typeof fetch
  origin?: string
  createId?: () => string
  now?: () => string
}

interface PreparedReference {
  dataUrl: string
  kind: GenerationReference['kind']
  mimeType: string
}

type ReferencePlan =
  | { kind: 'prepared'; value: PreparedReference }
  | {
      kind: 'fetch'
      url: string
      referenceKind: GenerationReference['kind']
    }

interface GeneratedAssetWire {
  kind: 'image' | 'video'
  url: string
  mimeType: string
  width?: number
  height?: number
  durationSeconds?: number
}

class ReferenceTooLargeError extends Error {}

export async function fetchLibTvCatalog(
  options: FetchLibTvCatalogOptions = {},
): Promise<LibTvCatalog> {
  const fetchImpl = options.fetch ?? fetch
  let response: Response
  try {
    response = await fetchImpl('/api/libtv/catalog', {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
      signal: options.signal,
    })
  } catch (error) {
    preserveAbort(error)
    throw new Error('无法读取 LibTV 目录，请确认本地桥接服务正在运行后重试。')
  }

  if (!response.ok) {
    throw new Error('无法读取 LibTV 目录，请确认本地桥接服务正在运行后重试。')
  }

  let body: unknown
  try {
    body = await response.json() as unknown
  } catch (error) {
    preserveAbort(error)
    throw new Error('LibTV 目录响应无效，请重试。')
  }

  return parseCatalog(body)
}

export class LibTvGenerationAdapter implements GenerationAdapter {
  readonly #preferenceStore: GenerationProviderPreferenceStore
  readonly #fetch: typeof fetch
  readonly #origin: string
  readonly #createId: () => string
  readonly #now: () => string

  constructor(options: LibTvGenerationAdapterOptions) {
    this.#preferenceStore = options.preferenceStore
    this.#fetch = options.fetch ?? fetch
    this.#origin = options.origin ?? browserOrigin()
    this.#createId = options.createId ?? (() => crypto.randomUUID())
    this.#now = options.now ?? (() => new Date().toISOString())
  }

  async start(
    request: GenerationRequest,
    signal: AbortSignal,
  ): Promise<GenerationResult> {
    signal.throwIfAborted()
    const selection = currentSelection(this.#preferenceStore)
    const referencePlans = planReferences(
      request.referenceAssets,
      this.#origin,
    )
    const referenceAssets = await Promise.all(
      referencePlans.map((plan) =>
        plan.kind === 'prepared'
          ? plan.value
          : fetchReference(plan, this.#fetch, signal),
      ),
    )
    signal.throwIfAborted()

    const response = await postGeneration(
      this.#fetch,
      signal,
      selection,
      request,
      referenceAssets,
    )
    const asset = parseGeneratedAsset(response, request.targetKind)
    const assetId = this.#createId()
    const versionId = this.#createId()
    const createdAt = this.#now()

    return {
      asset: {
        id: assetId,
        kind: asset.kind,
        url: asset.url,
        mimeType: asset.mimeType,
        ...(asset.width === undefined ? {} : { width: asset.width }),
        ...(asset.height === undefined ? {} : { height: asset.height }),
        ...(asset.durationSeconds === undefined
          ? {}
          : { durationSeconds: asset.durationSeconds }),
      },
      version: {
        id: versionId,
        createdAt,
        prompt: request.prompt,
        assetId,
      },
    }
  }
}

function parseCatalog(value: unknown): LibTvCatalog {
  if (!isRecord(value) ||
    typeof value.cliInstalled !== 'boolean' ||
    typeof value.authenticated !== 'boolean' ||
    typeof value.writesEnabled !== 'boolean' ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.imageModels) ||
    !Array.isArray(value.videoModels) ||
    (value.cliVersion !== undefined && typeof value.cliVersion !== 'string') ||
    (value.error !== undefined && typeof value.error !== 'string')) {
    throw new Error('LibTV 目录响应无效，请重试。')
  }

  const projects = value.projects.map(parseProject)
  const imageModels = value.imageModels.map(parseModel)
  const videoModels = value.videoModels.map(parseModel)
  return {
    cliInstalled: value.cliInstalled,
    ...(value.cliVersion === undefined ? {} : { cliVersion: value.cliVersion }),
    authenticated: value.authenticated,
    writesEnabled: value.writesEnabled,
    projects,
    imageModels,
    videoModels,
    ...(value.error === undefined
      ? {}
      : { error: 'LibTV 目录当前不可用，请检查 CLI 状态后重试。' }),
  }
}

function parseProject(value: unknown): LibTvCatalogProject {
  if (!isRecord(value) ||
    typeof value.uuid !== 'string' ||
    !LIBTV_PROJECT_UUID_PATTERN.test(value.uuid) ||
    !nonBlankString(value.name)) {
    throw new Error('LibTV 目录响应无效，请重试。')
  }
  return { uuid: value.uuid, name: value.name }
}

function parseModel(value: unknown): LibTvModelSummary {
  if (!isRecord(value) ||
    !nonBlankString(value.modelKey) ||
    !nonBlankString(value.modelName) ||
    !optionalString(value.description) ||
    !optionalString(value.estimatedTime) ||
    !optionalString(value.pricingRule) ||
    (value.vip !== undefined && typeof value.vip !== 'boolean')) {
    throw new Error('LibTV 目录响应无效，请重试。')
  }
  return {
    modelKey: value.modelKey,
    modelName: value.modelName,
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.estimatedTime === undefined ? {} : { estimatedTime: value.estimatedTime }),
    ...(value.pricingRule === undefined ? {} : { pricingRule: value.pricingRule }),
    ...(value.vip === undefined ? {} : { vip: value.vip }),
  }
}

function currentSelection(
  store: GenerationProviderPreferenceStore,
): LibTvProviderSelection {
  const preference = store.read()
  if (preference.provider !== 'libtv' ||
    !LIBTV_PROJECT_UUID_PATTERN.test(preference.selection.projectUuid) ||
    !nonBlankString(preference.selection.projectName) ||
    !nonBlankString(preference.selection.imageModelKey) ||
    !nonBlankString(preference.selection.imageModelName) ||
    !nonBlankString(preference.selection.videoModelKey) ||
    !nonBlankString(preference.selection.videoModelName)) {
    throw new Error('请先在画布的模型设置中启用 LibTV 实际生成。')
  }
  return {
    projectUuid: preference.selection.projectUuid,
    projectName: preference.selection.projectName,
    imageModelKey: preference.selection.imageModelKey,
    imageModelName: preference.selection.imageModelName,
    videoModelKey: preference.selection.videoModelKey,
    videoModelName: preference.selection.videoModelName,
  }
}

function planReferences(
  references: readonly GenerationReference[],
  origin: string,
): ReferencePlan[] {
  if (references.length > MAX_REFERENCES) {
    throw new Error('LibTV 最多支持 3 个参考素材。')
  }
  const baseUrl = validBaseUrl(origin)
  return references.map((reference) => {
    if (reference.url.startsWith('data:')) {
      return {
        kind: 'prepared',
        value: validateDataUrlReference(reference),
      }
    }
    const mimeType = supportedMime(reference.mimeType, reference.kind)
    if (!mimeType) {
      throw new Error('LibTV 参考素材类型不受支持或与素材种类不匹配。')
    }
    let url: URL
    try {
      url = new URL(reference.url, baseUrl)
    } catch {
      throw new Error('LibTV 参考素材必须使用相对地址或当前站点地址。')
    }
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.origin !== baseUrl.origin ||
      url.username !== '' ||
      url.password !== '') {
      throw new Error('LibTV 参考素材必须使用相对地址或当前站点地址。')
    }
    return { kind: 'fetch', url: url.href, referenceKind: reference.kind }
  })
}

function validateDataUrlReference(
  reference: GenerationReference,
): PreparedReference {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/]*={0,2})$/.exec(reference.url)
  if (!match || match[2].length === 0 || match[2].length % 4 !== 0) {
    throw new Error('LibTV 参考素材 Data URL 无效。')
  }
  const mimeType = match[1].toLowerCase()
  if (mimeType !== reference.mimeType.toLowerCase() ||
    !supportedMime(mimeType, reference.kind)) {
    throw new Error('LibTV 参考素材类型不受支持或与素材种类不匹配。')
  }
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0
  const decodedBytes = (match[2].length / 4) * 3 - padding
  if (decodedBytes > MAX_REFERENCE_BYTES) {
    throw new Error('LibTV 单个参考素材不能超过 20 MiB。')
  }
  return { dataUrl: reference.url, kind: reference.kind, mimeType }
}

async function fetchReference(
  plan: Extract<ReferencePlan, { kind: 'fetch' }>,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
): Promise<PreparedReference> {
  let response: Response
  try {
    response = await fetchImpl(plan.url, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal,
    })
  } catch (error) {
    preserveAbort(error)
    throw new Error('无法读取 LibTV 参考素材，请确认素材仍可访问。')
  }
  if (!response.ok) {
    throw new Error('无法读取 LibTV 参考素材，请确认素材仍可访问。')
  }
  const mimeType = response.headers.get('content-type')
    ?.split(';', 1)[0]?.trim().toLowerCase()
  if (!mimeType || !supportedMime(mimeType, plan.referenceKind)) {
    throw new Error('LibTV 参考素材类型不受支持或与素材种类不匹配。')
  }
  const contentLength = response.headers.get('content-length')
  if (contentLength && /^\d+$/.test(contentLength) &&
    Number(contentLength) > MAX_REFERENCE_BYTES) {
    try {
      await response.body?.cancel()
    } catch {
      // The size decision is final even if the transport cannot be cancelled.
    }
    throw new Error('LibTV 单个参考素材不能超过 20 MiB。')
  }

  let bytes: Uint8Array
  try {
    bytes = await readBoundedReferenceBody(response, signal)
  } catch (error) {
    preserveAbort(error)
    if (error instanceof ReferenceTooLargeError) {
      throw new Error('LibTV 单个参考素材不能超过 20 MiB。')
    }
    throw new Error('无法读取 LibTV 参考素材，请确认素材仍可访问。')
  }
  signal.throwIfAborted()
  return {
    dataUrl: `data:${mimeType};base64,${encodeBase64(bytes)}`,
    kind: plan.referenceKind,
    mimeType,
  }
}

async function postGeneration(
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  selection: LibTvProviderSelection,
  request: GenerationRequest,
  referenceAssets: PreparedReference[],
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl('/api/libtv/generate', {
      method: 'POST',
      cache: 'no-store',
      credentials: 'same-origin',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        confirmed: true,
        selection,
        request: {
          projectId: request.projectId,
          nodeId: request.nodeId,
          operation: request.operation,
          targetKind: request.targetKind,
          prompt: request.prompt,
          referenceAssets,
        },
      }),
      signal,
    })
  } catch (error) {
    preserveAbort(error)
    throw new Error('LibTV 生成请求失败，请检查本地桥接状态后重试。')
  }
  if (!response.ok) {
    throw new Error(await bridgeErrorMessage(response, signal))
  }
  try {
    const body = await response.json() as unknown
    signal.throwIfAborted()
    return body
  } catch (error) {
    preserveAbort(error)
    throw new Error('LibTV 生成结果无效，请重试。')
  }
}

async function bridgeErrorMessage(
  response: Response,
  signal: AbortSignal,
): Promise<string> {
  let code: string | undefined
  try {
    const body = await response.json() as unknown
    signal.throwIfAborted()
    if (isRecord(body) && isRecord(body.error) && typeof body.error.code === 'string') {
      code = body.error.code
    }
  } catch (error) {
    preserveAbort(error)
    signal.throwIfAborted()
    // Only fixed messages are returned for malformed error bodies.
  }
  if (code === 'WRITES_DISABLED') {
    return 'LibTV 写入未启用，请在画布的模型设置中检查写入门禁。'
  }
  if (code === 'PAYLOAD_TOO_LARGE') {
    return 'LibTV 生成请求过大，请减少参考素材后重试。'
  }
  if (code === 'UNSUPPORTED_MEDIA_TYPE' || code === 'INVALID_JSON') {
    return 'LibTV 生成请求无效，请检查模型与参考素材。'
  }
  return 'LibTV 生成请求失败，请检查本地桥接状态后重试。'
}

function parseGeneratedAsset(
  value: unknown,
  targetKind: GenerationRequest['targetKind'],
): GeneratedAssetWire {
  if (!isRecord(value) ||
    (value.kind !== 'image' && value.kind !== 'video') ||
    value.kind !== targetKind ||
    !validHttpUrl(value.url) ||
    typeof value.mimeType !== 'string' ||
    !supportedGeneratedMime(value.mimeType.toLowerCase(), value.kind) ||
    !optionalPositiveNumber(value.width) ||
    !optionalPositiveNumber(value.height) ||
    !optionalPositiveNumber(value.durationSeconds)) {
    throw new Error('LibTV 生成结果无效，请重试。')
  }
  return {
    kind: value.kind,
    url: value.url,
    mimeType: value.mimeType.toLowerCase(),
    ...(value.width === undefined ? {} : { width: value.width }),
    ...(value.height === undefined ? {} : { height: value.height }),
    ...(value.durationSeconds === undefined
      ? {}
      : { durationSeconds: value.durationSeconds }),
  }
}

async function readBoundedReferenceBody(
  response: Response,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array()

  const reader = response.body.getReader()
  let buffer = new Uint8Array(64 * 1024)
  let length = 0
  try {
    while (true) {
      signal.throwIfAborted()
      const { done, value } = await reader.read()
      if (done) break
      if (value.byteLength === 0) continue
      if (length + value.byteLength > MAX_REFERENCE_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // The size decision is final even if cancellation fails.
        }
        throw new ReferenceTooLargeError()
      }
      if (length + value.byteLength > buffer.byteLength) {
        let capacity = buffer.byteLength
        while (capacity < length + value.byteLength) {
          capacity = Math.min(MAX_REFERENCE_BYTES, capacity * 2)
        }
        const next = new Uint8Array(capacity)
        next.set(buffer.subarray(0, length))
        buffer = next
      }
      buffer.set(value, length)
      length += value.byteLength
    }
    signal.throwIfAborted()
    return buffer.slice(0, length)
  } finally {
    reader.releaseLock()
  }
}

function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = []
  let part = ''
  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]
    const second = bytes[index + 1]
    const third = bytes[index + 2]
    part += BASE64_ALPHABET[first >> 2]
    part += BASE64_ALPHABET[((first & 3) << 4) | ((second ?? 0) >> 4)]
    part += second === undefined
      ? '=='
      : BASE64_ALPHABET[((second & 15) << 2) | ((third ?? 0) >> 6)] +
        (third === undefined ? '=' : BASE64_ALPHABET[third & 63])
    if (part.length >= 32_768) {
      parts.push(part)
      part = ''
    }
  }
  parts.push(part)
  return parts.join('')
}

function supportedMime(
  mimeType: string,
  kind: GenerationReference['kind'] | 'image' | 'video',
): mimeType is SupportedMimeType {
  return mimeType in MIME_KINDS && MIME_KINDS[mimeType as SupportedMimeType] === kind
}

function supportedGeneratedMime(
  mimeType: string,
  kind: 'image' | 'video',
): boolean {
  return mimeType === `${kind}/*` || supportedMime(mimeType, kind)
}

function validHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' && url.password === ''
  } catch {
    return false
  }
}

function validBaseUrl(origin: string): URL {
  try {
    const url = new URL(origin)
    if ((url.protocol === 'http:' || url.protocol === 'https:') &&
      url.username === '' && url.password === '') {
      return url
    }
  } catch {
    // Fall through to the fixed reference error.
  }
  throw new Error('LibTV 参考素材必须使用相对地址或当前站点地址。')
}

function browserOrigin(): string {
  return typeof window !== 'undefined' &&
    (window.location.protocol === 'http:' || window.location.protocol === 'https:')
    ? window.location.origin
    : 'http://localhost'
}

function preserveAbort(error: unknown): void {
  if (error instanceof DOMException && error.name === 'AbortError') {
    throw error
  }
}

function optionalPositiveNumber(value: unknown): value is number | undefined {
  return value === undefined ||
    (typeof value === 'number' && Number.isFinite(value) && value > 0)
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || nonBlankString(value)
}

function nonBlankString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
