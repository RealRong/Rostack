import { memo } from 'react'
import type { EdgeId } from '@whiteboard/core/types'
import type {
  EdgeActiveRenderModel,
} from '@whiteboard/editor/types/editor'
import {
  readEdgeLabelMaskId,
  resolveEdgePathPresentation
} from './render'

const resolveActiveAccent = (input: {
  selected: boolean
  editing: boolean
  hovered: boolean
  stroke: string
  strokeWidth: number
}) => {
  if (input.selected || input.editing) {
    return {
      stroke: 'var(--ui-accent)',
      strokeWidth: Math.max(input.strokeWidth + 2, 4),
      opacity: 1
    }
  }

  if (input.hovered) {
    return {
      stroke: input.stroke,
      strokeWidth: Math.max(input.strokeWidth + 1, 3),
      opacity: 0.96
    }
  }

  return undefined
}

export const EdgeActiveLayer = memo(({
  model,
  labeledEdgeIds
}: {
  model: EdgeActiveRenderModel
  labeledEdgeIds: ReadonlySet<EdgeId>
}) => {
  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-active-layer"
      aria-hidden="true"
      focusable="false"
    >
      {model.edges.map((edge) => {
        const presentation = resolveEdgePathPresentation(edge.style)
        const accent = resolveActiveAccent({
          selected: edge.state.selected,
          editing: edge.state.editing,
          hovered: edge.state.hovered,
          stroke: presentation.stroke,
          strokeWidth: presentation.strokeWidth
        })
        if (!accent) {
          return null
        }

        return (
          <path
            key={edge.id}
            d={edge.svgPath}
            fill="none"
            stroke={accent.stroke}
            strokeWidth={accent.strokeWidth}
            opacity={accent.opacity}
            vectorEffect="non-scaling-stroke"
            pointerEvents="none"
            className="wb-edge-active-path"
            mask={labeledEdgeIds.has(edge.id)
              ? `url(#${readEdgeLabelMaskId(edge.id)})`
              : undefined}
          />
        )
      })}
    </svg>
  )
})

EdgeActiveLayer.displayName = 'EdgeActiveLayer'
