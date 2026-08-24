import type { Project } from '../project/model'

export interface PublishCoverOption {
  id: string
  nodeId: string
  label: string
  url: string
}

export interface ClipboardWriter {
  writeText(text: string): Promise<void>
}

export function collectPublishCoverOptions(project: Project): PublishCoverOption[] {
  const assets = new Map(project.assets.map((asset) => [asset.id, asset]))
  const options: PublishCoverOption[] = []
  const usedUrls = new Set<string>()

  for (const node of project.nodes) {
    for (const [index, result] of (node.imageResults ?? []).entries()) {
      const asset = assets.get(result.assetId)
      if (!asset || asset.kind !== 'image' || usedUrls.has(asset.url)) continue
      usedUrls.add(asset.url)
      options.push({
        id: result.id,
        nodeId: node.id,
        label: `${node.title} · 结果 ${index + 1}`,
        url: asset.url,
      })
    }

    const activeVersion = node.versions.find(({ id }) => id === node.activeVersionId)
    const activeAsset = activeVersion?.assetId ? assets.get(activeVersion.assetId) : undefined
    if (!activeAsset || activeAsset.kind !== 'image' || usedUrls.has(activeAsset.url)) continue
    usedUrls.add(activeAsset.url)
    options.push({
      id: activeVersion?.id ?? `${node.id}:active`,
      nodeId: node.id,
      label: `${node.title} · 当前结果`,
      url: activeAsset.url,
    })
  }

  return options
}

export function buildPublishedWorkShareUrl(workId: string) {
  return `https://andydb0927-coder.github.io/andydb/view/${encodeURIComponent(workId)}`
}

export async function copyPublishedWorkShareLink(
  workId: string,
  clipboard: ClipboardWriter = navigator.clipboard,
) {
  const url = buildPublishedWorkShareUrl(workId)
  await clipboard.writeText(url)
  return url
}
