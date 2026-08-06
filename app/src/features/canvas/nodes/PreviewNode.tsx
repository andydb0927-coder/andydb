import type { NodeProps } from '@xyflow/react'

import type { CreativeFlowNode } from '../node-types'
import { CreativeNodeShell } from './AssetNode'

export function PreviewNode({ data }: NodeProps<CreativeFlowNode>) {
  return <CreativeNodeShell data={data} />
}
