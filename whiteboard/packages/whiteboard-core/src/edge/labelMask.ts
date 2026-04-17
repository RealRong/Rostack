import type { Point, Size } from '@whiteboard/core/types'

const EDGE_LABEL_MASK_MARGIN = 0
const EDGE_LABEL_MASK_RADIUS = 0

export type EdgeLabelMaskRect = {
  x: number
  y: number
  width: number
  height: number
  radius: number
  center: Point
  angle: number
}

export const buildEdgeLabelMaskRect = ({
  center,
  size,
  angle = 0,
  margin = EDGE_LABEL_MASK_MARGIN
}: {
  center: Point
  size: Size
  angle?: number
  margin?: number
}): EdgeLabelMaskRect => ({
  x: center.x - size.width / 2 - margin,
  y: center.y - size.height / 2 - margin,
  width: size.width + margin * 2,
  height: size.height + margin * 2,
  radius: EDGE_LABEL_MASK_RADIUS,
  center,
  angle
})

export const readEdgeLabelMaskTransform = (
  rect: Pick<EdgeLabelMaskRect, 'angle' | 'center'>
) => rect.angle === 0
  ? undefined
  : `rotate(${rect.angle} ${rect.center.x} ${rect.center.y})`
