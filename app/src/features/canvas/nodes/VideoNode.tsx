import type { NodeProps } from '@xyflow/react'

import type { CreativeFlowNode } from '../node-types'
import { CreativeNodeShell } from './AssetNode'

export function VideoNode({ data }: NodeProps<CreativeFlowNode>) {
  return <CreativeNodeShell data={data} />
}
