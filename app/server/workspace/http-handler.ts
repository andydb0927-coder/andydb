import {
  executeWorkspaceCommand,
  WORKSPACE_COMMAND_MANIFEST,
  WorkspaceCommandError,
} from './workspace-command.js'

export const WORKSPACE_MANIFEST_PATH = '/api/workspace/manifest'
export const WORKSPACE_EXECUTE_PATH = '/api/workspace/execute'
const MAX_BODY_BYTES = 1024 * 1024

type WorkspaceExecutor = typeof executeWorkspaceCommand

export interface WorkspaceHttpHandlerOptions {
  execute?: WorkspaceExecutor
}

export type WorkspaceHttpHandler = (request: Request) => Promise<Response | undefined>

export function createWorkspaceHttpHandler(
  options: WorkspaceHttpHandlerOptions = {},
): WorkspaceHttpHandler {
  const execute = options.execute ?? executeWorkspaceCommand
  return async (request) => {
    const pathname = new URL(request.url).pathname
    if (pathname !== WORKSPACE_MANIFEST_PATH && pathname !== WORKSPACE_EXECUTE_PATH) {
      return undefined
    }
    if (pathname === WORKSPACE_MANIFEST_PATH) {
      if (request.method !== 'GET') return methodNotAllowed('GET')
      return successResponse(WORKSPACE_COMMAND_MANIFEST)
    }
    if (request.method !== 'POST') return methodNotAllowed('POST')
    if (!isJsonContentType(request.headers.get('content-type'))) {
      return errorResponse(415, 'UNSUPPORTED_MEDIA_TYPE', 'Content-Type must be application/json')
    }
    const length = classifyContentLength(request.headers.get('content-length'))
    if (length === 'invalid') return errorResponse(400, 'INVALID_CONTENT_LENGTH', 'Content-Length is invalid')
    if (length === 'too-large') return payloadTooLarge()

    const text = await readBoundedBody(request)
    if (text === undefined) return payloadTooLarge()
    let body: unknown
    try {
      body = JSON.parse(text)
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be valid JSON')
    }
    if (
      typeof body !== 'object' || body === null || Array.isArray(body) ||
      !('schemaVersion' in body) || body.schemaVersion !== 1 ||
      !('command' in body) || typeof body.command !== 'string' ||
      !('input' in body) ||
      Object.keys(body).some((key) => !['schemaVersion', 'command', 'input'].includes(key))
    ) {
      return errorResponse(400, 'SCHEMA_VALIDATION_FAILED', 'Workspace command envelope is invalid')
    }
    try {
      const output = execute(body.command, body.input)
      return successResponse({ command: body.command, output })
    } catch (error) {
      if (error instanceof WorkspaceCommandError) {
        return errorResponse(
          error.code === 'UNKNOWN_COMMAND' ? 404 : 400,
          error.code,
          error.message,
          error.details,
        )
      }
      return errorResponse(500, 'INTERNAL_ERROR', 'Workspace command failed')
    }
  }
}

export function isJsonContentType(value: string | null) {
  return value !== null && /^application\/json\s*(?:;\s*charset\s*=\s*utf-8\s*)?$/i.test(value.trim())
}

export function classifyContentLength(value: string | null): 'valid' | 'invalid' | 'too-large' {
  if (value === null) return 'valid'
  if (!/^\d+$/.test(value)) return 'invalid'
  return Number(value) > MAX_BODY_BYTES ? 'too-large' : 'valid'
}

async function readBoundedBody(request: Request): Promise<string | undefined> {
  if (!request.body) return ''
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BODY_BYTES) {
        try { await reader.cancel() } catch { /* size decision is final */ }
        return undefined
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8')
}

function methodNotAllowed(allow: 'GET' | 'POST') {
  const response = errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method not allowed')
  response.headers.set('allow', allow)
  return response
}

function payloadTooLarge() {
  return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds 1 MiB')
}

function successResponse(data: unknown) {
  return jsonResponse({ schemaVersion: 1, data })
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  return jsonResponse({
    schemaVersion: 1,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  }, status)
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  })
}
