import { memo } from 'react'
import { useKeyedStoreValue, useStoreValue } from '@shared/react'
import type { EdgeId } from '@whiteboard/core/types'
import { useEditorRuntime } from '@whiteboard/react/runtime/hooks'
import { EdgeActiveLayer } from './EdgeActiveLayer'
import { EdgeLabelLayer } from './EdgeLabelLayer'
import { EdgeStaticLayer } from './EdgeStaticLayer'
import {
  readEdgeLabelMaskId,
  renderEdgeLabelMaskTransform
} from './render'

const FULL_MASK_SIZE = 2000000
const FULL_MASK_OFFSET = -1000000

const EdgeMaskDef = memo(({
  edgeId
}: {
  edgeId: EdgeId
}) => {
  const editor = useEditorRuntime()
  const mask = useKeyedStoreValue(
    editor.projection.stores.render.edge.masks.byId,
    edgeId
  )
  if (!mask || mask.rects.length === 0) {
    return null
  }

  return (
    <mask
      id={readEdgeLabelMaskId(edgeId)}
      maskUnits="userSpaceOnUse"
      x={FULL_MASK_OFFSET}
      y={FULL_MASK_OFFSET}
      width={FULL_MASK_SIZE}
      height={FULL_MASK_SIZE}
    >
      <rect
        x={FULL_MASK_OFFSET}
        y={FULL_MASK_OFFSET}
        width={FULL_MASK_SIZE}
        height={FULL_MASK_SIZE}
        fill="white"
      />
      {mask.rects.map((rect, index) => (
        <rect
          key={`${edgeId}:${index}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx={rect.radius}
          ry={rect.radius}
          fill="black"
          transform={renderEdgeLabelMaskTransform(rect)}
        />
      ))}
    </mask>
  )
})

EdgeMaskDef.displayName = 'EdgeMaskDef'

export const EdgeSceneLayer = memo(() => {
  const editor = useEditorRuntime()
  const maskIds = useStoreValue(editor.projection.stores.render.edge.masks.ids)

  return (
    <div className="wb-edge-scene">
      {maskIds.length > 0 ? (
        <svg
          className="wb-edge-scene-defs"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            {maskIds.map((edgeId) => (
              <EdgeMaskDef
                key={edgeId}
                edgeId={edgeId}
              />
            ))}
          </defs>
        </svg>
      ) : null}
      <EdgeStaticLayer />
      <EdgeActiveLayer />
      <EdgeLabelLayer />
    </div>
  )
})

EdgeSceneLayer.displayName = 'EdgeSceneLayer'
