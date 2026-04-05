import {
  readDrawBaseSize,
  readDrawPoints
} from '@whiteboard/core/node'
import type { NodeDefinition } from '../../../../types/node'
import {
  DrawStrokeHitShape,
  DrawStrokeSelectionShape,
  DrawStrokeShape
} from '../../../draw/stroke'
import { createSchema, getStyleNumber, getStyleString, styleField } from './shared'

const drawSchema = createSchema('draw', 'Draw', [
  styleField('stroke', 'Stroke', 'color'),
  styleField('strokeWidth', 'Stroke width', 'number', { min: 1, step: 1 }),
  styleField('opacity', 'Opacity', 'number', { min: 0, max: 1, step: 0.05 })
])

export const DrawNodeDefinition: NodeDefinition = {
  type: 'draw',
  meta: {
    name: 'Draw',
    family: 'draw',
    icon: 'draw',
    controls: ['stroke']
  },
  role: 'content',
  geometry: 'rect',
  hit: 'path',
  connect: false,
  canResize: false,
  canRotate: false,
  schema: drawSchema,
  render: ({ node, selected }) => {
    const points = readDrawPoints(node)
    const baseSize = readDrawBaseSize(node)
    const stroke = getStyleString(node, 'stroke') ?? 'var(--ui-text-primary)'
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
