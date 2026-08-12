import type { NodeProps } from '@xyflow/react'

import type { CreativeCard } from '../../project/model'
import type { CreativeFlowNode } from '../node-types'
import { CreativeNodeShell } from './AssetNode'

const fieldRows = (card: CreativeCard) => {
  if (card.kind === 'script') {
    return [
      ['分场', card.scenes],
      ['对白', card.dialogue],
      ['镜头备注', card.shotNotes],
    ]
  }
  if (card.kind === 'character-card') {
    return [
      ['姓名', card.name],
      ['外貌锚点', card.appearance],
      ['服化道', card.wardrobe],
      ['关系', card.relationships],
    ]
  }
  return [
    ['背景', card.background],
    ['美术风格', card.artStyle],
    ['规则', card.rules],
  ]
}

export function CreativeCardNode({ data }: NodeProps<CreativeFlowNode>) {
  const card = data.node.card

  return (
    <CreativeNodeShell
      data={data}
      hidePrompt
      preview={
        <span className="creative-card-node__content">
          {data.asset ? (
            <img
              src={data.asset.url}
              alt=""
              className="creative-card-node__image"
            />
          ) : null}
          {card ? (
            <span className="creative-card-node__fields">
              {fieldRows(card)
                .filter(([, value]) => value.length > 0)
                .map(([label, value]) => (
                  <span className="creative-card-node__field" key={label}>
                    <span>{label}</span>
                    <strong>{value}</strong>
                  </span>
                ))}
            </span>
          ) : (
            <span className="creative-card-node__unavailable">
              卡片数据不可用
            </span>
          )}
        </span>
      }
    />
  )
}
