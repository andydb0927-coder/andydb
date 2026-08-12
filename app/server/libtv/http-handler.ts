import { tmpdir } from 'node:os'

import type {
  LibTvCatalog,
  LibTvCatalogProject,
  LibTvModelSummary,
} from '../../src/features/generation/libtv-contract.js'
import { loadLibTvCatalog } from './catalog.js'
import { executeLibTvGeneration } from './generation-command.js'
import type { CliRunner, LibTvGeneratedAsset } from './types.js'

export const LIBTV_CATALOG_PATH = '/api/libtv/catalog'
export const LIBTV_GENERATE_PATH = '/api/libtv/generate'
const MAX_BODY_BYTES = 90 * 1024 * 1024

export type LibTvContentLengthDisposition = 'valid' | 'invalid' | 'too-large'

type CatalogLoader = typeof loadLibTvCatalog
type GenerationExecutor = typeof executeLibTvGeneration

export interface LibTvHttpHandlerOptions {
  runner: CliRunner
  writesEnabled: boolean
  fileWorkspace?: string
  loadCatalog?: CatalogLoader
  executeGeneration?: GenerationExecutor
}

export type LibTvHttpHandler = (
  request: Request,
) => Promise<Response | undefined>

export function createLibTvHttpHandler(
  options: LibTvHttpHandlerOptions,
): LibTvHttpHandler {
  const catalogLoader = options.loadCatalog ?? loadLibTvCatalog
  const generationExecutor = options.executeGeneration ?? executeLibTvGeneration
  const fileWorkspace = options.fileWorkspace ?? tmpdir()

  return async (request) => {
    const pathname = new URL(request.url).pathname
    if (pathname !== LIBTV_CATALOG_PATH && pathname !== LIBTV_GENERATE_PATH) {
      return undefined
    }

    if (pathname === LIBTV_CATALOG_PATH) {
      if (request.method !== 'GET') {
        return methodNotAllowed('GET')
      }

      try {
        const catalog = await catalogLoader(options.runner, options.writesEnabled)
        return jsonResponse(allowlistedCatalog(catalog))
      } catch {
        return internalError()
      }
    }

    if (request.method !== 'POST') {
      return methodNotAllowed('POST')
    }
    if (!options.writesEnabled) {
      return errorResponse(
        403,
        'WRITES_DISABLED',
        'LibTV writes are disabled',
      )
    }
    if (!isLibTvJsonContentType(request.headers.get('content-type'))) {
      return errorResponse(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Content-Type must be application/json',
      )
    }

    const contentLength = classifyLibTvContentLength(
      request.headers.get('content-length'),
    )
    if (contentLength === 'invalid') {
      return errorResponse(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid')
    }
    if (contentLength === 'too-large') {
      return payloadTooLarge()
    }

    try {
      const bodyText = await readBoundedBody(request)
      if (bodyText === undefined) {
        return payloadTooLarge()
      }

      let body: unknown
      try {
        body = JSON.parse(bodyText) as unknown
      } catch {
        return errorResponse(
          400,
          'INVALID_JSON',
          'Request body must be valid JSON',
        )
      }

      const catalog = await catalogLoader(options.runner, options.writesEnabled)
      const asset = await generationExecutor(
        body,
        catalog,
        options.runner,
        fileWorkspace,
      )
      return jsonResponse(allowlistedAsset(asset))
    } catch {
      return internalError()
    }
  }
}

async function readBoundedBody(request: Request): Promise<string | undefined> {
  if (!request.body) {
    return ''
  }

  const reader = request.body.getReader()
  let bodyBuffer: Buffer | undefined
  let totalBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      if (value.byteLength === 0) {
        continue
      }
      const nextTotalBytes = totalBytes + value.byteLength
      if (nextTotalBytes > MAX_BODY_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // The size decision is final even if the transport cannot be cancelled cleanly.
        }
        return undefined
      }
      if (!bodyBuffer || bodyBuffer.byteLength < nextTotalBytes) {
        let nextCapacity = Math.max(bodyBuffer?.byteLength ?? 0, 1_024)
        while (nextCapacity < nextTotalBytes) {
          nextCapacity = Math.min(
            MAX_BODY_BYTES,
            Math.max(nextTotalBytes, nextCapacity * 2),
          )
        }
        const expandedBuffer = Buffer.allocUnsafe(nextCapacity)
        bodyBuffer?.copy(expandedBuffer, 0, 0, totalBytes)
        bodyBuffer = expandedBuffer
      }
      bodyBuffer.set(value, totalBytes)
      totalBytes = nextTotalBytes
    }
  } finally {
    reader.releaseLock()
  }

  return bodyBuffer?.subarray(0, totalBytes).toString('utf8') ?? ''
}

export function isLibTvJsonContentType(contentType: string | null): boolean {
  return contentType !== null &&
    /^application\/json\s*(?:;\s*charset\s*=\s*utf-8\s*)?$/i.test(contentType.trim())
}

export function classifyLibTvContentLength(
  contentLength: string | null,
): LibTvContentLengthDisposition {
  if (contentLength === null) {
    return 'valid'
  }
  if (!/^\d+$/.test(contentLength)) {
    return 'invalid'
  }
  return Number(contentLength) > MAX_BODY_BYTES ? 'too-large' : 'valid'
}

function allowlistedCatalog(catalog: LibTvCatalog): LibTvCatalog {
  return {
    cliInstalled: catalog.cliInstalled,
    ...(catalog.cliVersion === undefined ? {} : { cliVersion: catalog.cliVersion }),
    authenticated: catalog.authenticated,
    writesEnabled: catalog.writesEnabled,
    projects: catalog.projects.map(allowlistedProject),
    imageModels: catalog.imageModels.map(allowlistedModel),
    videoModels: catalog.videoModels.map(allowlistedModel),
    ...(catalog.error === undefined ? {} : { error: catalog.error }),
  }
}

function allowlistedProject(project: LibTvCatalogProject): LibTvCatalogProject {
  return { uuid: project.uuid, name: project.name }
}

function allowlistedModel(model: LibTvModelSummary): LibTvModelSummary {
  return {
    modelKey: model.modelKey,
    modelName: model.modelName,
    ...(model.description === undefined ? {} : { description: model.description }),
    ...(model.estimatedTime === undefined ? {} : { estimatedTime: model.estimatedTime }),
    ...(model.pricingRule === undefined ? {} : { pricingRule: model.pricingRule }),
    ...(model.vip === undefined ? {} : { vip: model.vip }),
  }
}

function allowlistedAsset(asset: LibTvGeneratedAsset): LibTvGeneratedAsset {
  return {
    kind: asset.kind,
    url: asset.url,
    mimeType: asset.mimeType,
    ...(asset.poster === undefined ? {} : { poster: asset.poster }),
    ...(asset.width === undefined ? {} : { width: asset.width }),
    ...(asset.height === undefined ? {} : { height: asset.height }),
    ...(asset.durationSeconds === undefined
      ? {}
      : { durationSeconds: asset.durationSeconds }),
  }
}

function methodNotAllowed(allow: 'GET' | 'POST'): Response {
  const response = errorResponse(
    405,
    'METHOD_NOT_ALLOWED',
    'Method not allowed',
  )
  response.headers.set('allow', allow)
  return response
}

function payloadTooLarge(): Response {
  return errorResponse(
    413,
    'PAYLOAD_TOO_LARGE',
    'Request body exceeds 90 MiB',
  )
}

function internalError(): Response {
  return errorResponse(
    500,
    'INTERNAL_ERROR',
    'LibTV bridge request failed',
  )
}

function errorResponse(status: number, code: string, message: string): Response {
  return jsonResponse({ error: { code, message } }, status)
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
