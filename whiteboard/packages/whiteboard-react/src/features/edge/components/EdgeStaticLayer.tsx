import { memo } from 'react'
import type { EdgeId } from '@whiteboard/core/types'
import type {
  EdgeStaticRenderModel
} from '@whiteboard/editor/types/editor'
import {
  readEdgeLabelMaskId,
  resolveEdgePathPresentation
} from './render'

export const EdgeStaticLayer = memo(({
  model,
  labeledEdgeIds
}: {
  model: EdgeStaticRenderModel
  labeledEdgeIds: ReadonlySet<EdgeId>
}) => {
  return (
    <svg
      width="100%"
      height="100%"
      overflow="visible"
      className="wb-edge-static-layer"
      aria-hidden="true"
      focusable="false"
    >
      {model.buckets.map((bucket) => {
        const presentation = resolveEdgePathPresentation(bucket.style)
        return (
          <g key={bucket.id} data-bucket={bucket.id}>
            {bucket.paths.map((path) => (
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
                mask={labeledEdgeIds.has(path.id)
                  ? `url(#${readEdgeLabelMaskId(path.id)})`
                  : undefined}
              />
            ))}
          </g>
        )
      })}
    </svg>
  )
})

EdgeStaticLayer.displayName = 'EdgeStaticLayer'
