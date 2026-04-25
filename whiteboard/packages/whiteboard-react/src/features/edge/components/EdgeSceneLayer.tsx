import { memo, useMemo } from 'react'
import type { EdgeId } from '@whiteboard/core/types'
import type { EdgeLabelRenderItem } from '@whiteboard/editor/types/editor'
import { useStoreValue } from '@shared/react'
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

const groupLabelsByEdge = (
  labels: readonly EdgeLabelRenderItem[]
) => {
  const ids = new Set<EdgeId>()
  const groups = new Map<EdgeId, EdgeLabelRenderItem[]>()

  labels.forEach((label) => {
    ids.add(label.edgeId)

    const current = groups.get(label.edgeId)
    if (current) {
      current.push(label)
      return
    }

    groups.set(label.edgeId, [label])
  })

  return {
    labeledEdgeIds: ids,
    labelGroups: [...groups.entries()].map(([edgeId, edgeLabels]) => ({
      edgeId,
      labels: edgeLabels
    }))
  }
}

export const EdgeSceneLayer = memo(() => {
  const editor = useEditorRuntime()
  const staticModel = useStoreValue(editor.scene.edge.render.static)
  const activeModel = useStoreValue(editor.scene.edge.render.active)
  const labelModel = useStoreValue(editor.scene.edge.render.labels)
  const {
    labeledEdgeIds,
    labelGroups
  } = useMemo(
    () => groupLabelsByEdge(labelModel.labels),
    [labelModel.labels]
  )

  return (
    <div className="wb-edge-scene">
      {labelGroups.length > 0 ? (
        <svg
          className="wb-edge-scene-defs"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            {labelGroups.map((group) => {
              return (
                <mask
                  key={group.edgeId}
                  id={readEdgeLabelMaskId(group.edgeId)}
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
                  {group.labels.map((label) => (
                    <rect
                      key={`${label.edgeId}:${label.labelId}`}
                      x={label.maskRect.x}
                      y={label.maskRect.y}
                      width={label.maskRect.width}
                      height={label.maskRect.height}
                      rx={label.maskRect.radius}
                      ry={label.maskRect.radius}
                      fill="black"
                      transform={renderEdgeLabelMaskTransform(label)}
                    />
                  ))}
                </mask>
              )
            })}
          </defs>
        </svg>
      ) : null}
      <EdgeStaticLayer
        model={staticModel}
        labeledEdgeIds={labeledEdgeIds}
      />
      <EdgeActiveLayer
        model={activeModel}
        labeledEdgeIds={labeledEdgeIds}
      />
      <EdgeLabelLayer
        model={labelModel}
      />
    </div>
  )
})

EdgeSceneLayer.displayName = 'EdgeSceneLayer'
