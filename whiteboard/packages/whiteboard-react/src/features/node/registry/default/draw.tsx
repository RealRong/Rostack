import {
  WHITEBOARD_TEXT_DEFAULT_COLOR
} from '@whiteboard/product/palette'
import { node as nodeApi } from '@whiteboard/core/node'
import type { NodeSpecEntry } from '@whiteboard/react/types/node'
import {
  DrawStrokeHitShape,
  DrawStrokeSelectionShape,
  DrawStrokeShape
} from '@whiteboard/react/features/draw/stroke'
import { toSpatialNode } from '@whiteboard/react/features/node/spatial'
import { resolvePaletteColorOr } from '@whiteboard/react/features/palette'
import { getStyleNumber, getStyleString } from '@whiteboard/react/features/node/registry/default/shared'

const drawSchema = {
  fields: {
    'style.stroke': {
      label: 'Stroke',
      type: 'color'
    },
    'style.strokeWidth': {
      label: 'Stroke width',
      type: 'number',
      min: 1,
      step: 1
    },
    'style.opacity': {
      label: 'Opacity',
      type: 'number',
      min: 0,
      max: 1,
      step: 0.05
    }
  }
} as const

export const DrawNodeSpec: NodeSpecEntry = {
  meta: {
    type: 'draw',
    name: 'Draw',
    family: 'draw',
    icon: 'draw',
    controls: ['stroke']
  },
  schema: drawSchema,
  behavior: {
    role: 'content',
    geometry: 'rect',
    hit: 'path',
    connect: false,
    resize: false,
    rotate: false,
    layout: {
      kind: 'none'
    },
    render: ({ node, rect, rotation, selected }) => {
      const spatial = toSpatialNode({
        node,
        rect,
        rotation
      })
      const points = nodeApi.draw.points(spatial)
      const baseSize = nodeApi.draw.baseSize(spatial)
      const stroke = resolvePaletteColorOr(
        getStyleString(node, 'stroke'),
        WHITEBOARD_TEXT_DEFAULT_COLOR
      ) ?? 'var(--ui-text-primary)'
      const strokeWidth = getStyleNumber(node, 'strokeWidth') ?? 2
      const opacity = getStyleNumber(node, 'opacity') ?? 1

      return (
        <svg
          width="100%"
          height="100%"
          className="wb-draw-node-svg"
          viewBox={`0 0 ${baseSize.width} ${baseSize.height}`}
          preserveAspectRatio="none"
          style={{ pointerEvents: 'none' }}
        >
          {selected ? (
            <DrawStrokeSelectionShape
              points={points}
              width={strokeWidth}
            />
          ) : null}
          <DrawStrokeShape
            points={points}
            color={stroke}
            width={strokeWidth}
            opacity={opacity}
          />
          <DrawStrokeHitShape
            points={points}
            width={strokeWidth}
          />
        </svg>
      )
    },
    style: () => ({
      border: 'none',
      boxShadow: 'none',
      background: 'transparent',
      borderRadius: 0,
      overflow: 'visible'
    })
  }
}
