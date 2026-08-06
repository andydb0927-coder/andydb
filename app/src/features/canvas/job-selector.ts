import type { CanvasNode, GenerationJob } from '../project/model'

function compareJobs(a: GenerationJob, b: GenerationJob) {
  return (
    a.updatedAt.localeCompare(b.updatedAt) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  )
}

export function selectNodeGenerationJob(
  node: CanvasNode,
  jobs: GenerationJob[],
) {
  const activeVersion = node.versions.find(
    (version) => version.id === node.activeVersionId,
  )
  const referencedJob = activeVersion?.generationJobId
    ? jobs.find((job) => job.id === activeVersion.generationJobId)
    : undefined
  if (referencedJob?.nodeId === node.id) return referencedJob

  return jobs
    .filter((job) => job.nodeId === node.id)
    .reduce<GenerationJob | undefined>(
      (latest, job) => (!latest || compareJobs(job, latest) > 0 ? job : latest),
      undefined,
    )
}
