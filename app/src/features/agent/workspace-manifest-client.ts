export interface WorkspaceCommandSummary {
  id: string
  description: string
}

export interface WorkspaceManifestSummary {
  namespace: 'wireless-canvas.workspace'
  commands: WorkspaceCommandSummary[]
}

export interface WorkspaceManifestClient {
  loadManifest(): Promise<WorkspaceManifestSummary>
}

type WorkspaceManifestRequest = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function normalizeManifest(value: unknown): WorkspaceManifestSummary {
  if (typeof value !== 'object' || value === null) throw new Error('invalid envelope')
  const envelope = value as { schemaVersion?: unknown; data?: unknown }
  if (envelope.schemaVersion !== 1 || typeof envelope.data !== 'object' || envelope.data === null) {
    throw new Error('invalid envelope')
  }
  const data = envelope.data as {
    schemaVersion?: unknown
    namespace?: unknown
    commands?: unknown
  }
  if (
    data.schemaVersion !== 1 ||
    data.namespace !== 'wireless-canvas.workspace' ||
    !Array.isArray(data.commands)
  ) {
    throw new Error('invalid manifest')
  }
  const commands = data.commands.map((command) => {
    if (typeof command !== 'object' || command === null) throw new Error('invalid command')
    const candidate = command as { id?: unknown; description?: unknown }
    if (!isNonEmptyString(candidate.id) || !isNonEmptyString(candidate.description)) {
      throw new Error('invalid command')
    }
    return { id: candidate.id, description: candidate.description }
  })
  return { namespace: data.namespace, commands }
}

export async function loadWorkspaceManifest(
  request: WorkspaceManifestRequest = fetch,
): Promise<WorkspaceManifestSummary> {
  try {
    const response = await request('/api/workspace/manifest', {
      method: 'GET',
      credentials: 'same-origin',
      headers: { accept: 'application/json' },
    })
    if (!response.ok) throw new Error('unavailable')
    return normalizeManifest(await response.json() as unknown)
  } catch {
    throw new Error('本地 CLI 桥接不可用')
  }
}

export const defaultWorkspaceManifestClient: WorkspaceManifestClient = {
  loadManifest: () => loadWorkspaceManifest(),
}
