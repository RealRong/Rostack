import { memo, useMemo } from 'react'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeStaticId } from '@whiteboard/editor-scene'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import {
  readEdgeLabelMaskId,
  resolveEdgePathPresentation
} from './render'

const EdgeStaticItem = memo(({
  staticId,
  maskedEdgeIds
}: {
  staticId: EdgeStaticId
  maskedEdgeIds: ReadonlySet<EdgeId>
}) => {
  const editor = useEditorRuntime()
  const item = useKeyedStoreValue(
    editor.scene.edge.render.statics.byId,
    staticId
  )
  if (!item) {
    return null
  }

  const presentation = resolveEdgePathPresentation(item.style)

  return (
    <g data-static={staticId}>
      {item.paths.map((path) => (
        <path
          key={path.id}
          d={path.svgPath}
          fill="none"
          stroke={presentation.stroke}
          strokeWidth={presentation.strokeWidth}
          strokeDasharray={presentation.dash}
          markerStart={presentation.markerStart}
          markerEnd={presentation.markerEnd}
          opacity={presentation.strokeOpacity}
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
          className="wb-edge-visible-path"
          mask={maskedEdgeIds.has(path.id)
            ? `url(#${readEdgeLabelMaskId(path.id)})`
            : undefined}
        />
      ))}
    </g>
  )
})

EdgeStaticItem.displayName = 'EdgeStaticItem'

export const EdgeStaticLayer = memo(() => {
  const editor = useEditorRuntime()
  const staticIds = useStoreValue(editor.scene.edge.render.statics.ids)
  const maskIds = useStoreValue(editor.scene.edge.render.masks.ids)
  const maskedEdgeIds = useMemo(
    () => new Set(maskIds),
    [maskIds]
  )

  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-static-layer"
      aria-hidden="true"
      focusable="false"
    >
      {staticIds.map((staticId) => (
        <EdgeStaticItem
          key={staticId}
          staticId={staticId}
          maskedEdgeIds={maskedEdgeIds}
        />
      ))}
    </svg>
  )
})

EdgeStaticLayer.displayName = 'EdgeStaticLayer'
