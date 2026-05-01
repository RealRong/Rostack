import { memo, useMemo } from 'react'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import type { EdgeId } from '@whiteboard/core/types'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
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

const EdgeActiveItem = memo(({
  edgeId,
  maskedEdgeIds
}: {
  edgeId: EdgeId
  maskedEdgeIds: ReadonlySet<EdgeId>
}) => {
  const editor = useEditorRuntime()
  const edge = useKeyedStoreValue(
    editor.projection.stores.render.edge.active.byId,
    edgeId
  )
  if (!edge) {
    return null
  }

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
      d={edge.svgPath}
      fill="none"
      stroke={accent.stroke}
      strokeWidth={accent.strokeWidth}
      opacity={accent.opacity}
      vectorEffect="non-scaling-stroke"
      pointerEvents="none"
      className="wb-edge-active-path"
      mask={maskedEdgeIds.has(edge.edgeId)
        ? `url(#${readEdgeLabelMaskId(edge.edgeId)})`
        : undefined}
    />
  )
})

EdgeActiveItem.displayName = 'EdgeActiveItem'

export const EdgeActiveLayer = memo(() => {
  const editor = useEditorRuntime()
  const activeIds = useStoreValue(editor.projection.stores.render.edge.active.ids)
  const maskIds = useStoreValue(editor.projection.stores.render.edge.masks.ids)
  const maskedEdgeIds = useMemo(
    () => new Set(maskIds),
    [maskIds]
  )

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-active-layer"
      aria-hidden="true"
      focusable="false"
    >
      {activeIds.map((edgeId) => (
        <EdgeActiveItem
          key={edgeId}
          edgeId={edgeId}
          maskedEdgeIds={maskedEdgeIds}
        />
      ))}
    </svg>
  )
})

EdgeActiveLayer.displayName = 'EdgeActiveLayer'
