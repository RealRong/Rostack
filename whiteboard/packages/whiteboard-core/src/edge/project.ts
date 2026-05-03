import { entityTable } from '@shared/core'
import { geometry as geometryApi } from '@whiteboard/core/geometry'
import { getEdgePathBounds } from '@whiteboard/core/edge/hitTest'
import {
  buildEdgeLabelMaskRect
} from '@whiteboard/core/edge/labelMask'
import {
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacement,
  resolveEdgeLabelPlacementSize
} from '@whiteboard/core/edge/label'
import { applyEdgePatch } from '@whiteboard/core/edge/patch'
import type {
  Edge,
  EdgePatch,
  EdgeLabel,
  Node,
  NodeGeometry,
  NodeModel,
  NodeId,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type {
  EdgeNodeCanvasSnapshot
} from '@whiteboard/core/types/edge'
import type {
  EdgeView
} from '@whiteboard/core/types/edge'
import type {
  EdgeBox
} from '@whiteboard/core/edge/view'

export type ProjectedEdgeLabel = {
  labelId: string
  text: string
  displayText: string
  style: EdgeLabel['style']
  size: Size
  point: Point
  angle: number
  rect: Rect
  maskRect: ReturnType<typeof buildEdgeLabelMaskRect>
}

export type ProjectedEdgeRoute = {
  points: readonly Point[]
  segments: EdgeView['path']['segments']
  svgPath?: string
  bounds?: Rect
  pathBounds?: Rect
  source?: Point
  target?: Point
  ends?: EdgeView['ends']
  handles: EdgeView['handles']
  labels: readonly ProjectedEdgeLabel[]
}

export const createEdgeNodeSnapshot = (input: {
  node: NodeModel
  rect: Rect
  outline: NodeGeometry
  rotation: number
}): EdgeNodeCanvasSnapshot => ({
  node: {
    ...input.node,
    position: {
      x: input.rect.x,
      y: input.rect.y
    },
    size: {
      width: input.rect.width,
      height: input.rect.height
    },
    rotation: input.rotation
  } satisfies Node,
  geometry: input.outline
})

export const resolveProjectedEdge = (input: {
  edge: Edge
  patch?: EdgePatch
}): Edge => input.patch
  ? applyEdgePatch(input.edge, input.patch)
  : input.edge

export const resolveProjectedEdgeNodes = (
  edge: Edge
): {
  source?: NodeId
  target?: NodeId
} => ({
  source: edge.source.kind === 'node'
    ? edge.source.nodeId
    : undefined,
  target: edge.target.kind === 'node'
    ? edge.target.nodeId
    : undefined
})

export const readManualRoutePoints = (
  edge: Edge
): readonly Point[] => edge.points
  ? entityTable.read.list(edge.points)
  : []

export const readEdgeLabelDisplayText = (
  value: string,
  editing: boolean
): string => value || (editing ? 'Label' : '')

export const buildEdgeLabelRect = (
  point: Point,
  size: Size
): Rect => ({
  x: point.x - size.width / 2,
  y: point.y - size.height / 2,
  width: size.width,
  height: size.height
})

export const resolveProjectedEdgeBox = (
  pathBounds: Rect | undefined,
  edge: Edge
): EdgeBox | undefined => pathBounds
  ? {
      rect: pathBounds,
      pad: Math.max(24, (edge.style?.width ?? 2) + 16)
    }
  : undefined

export const resolveProjectedEdgeRoute = (input: {
  edge: Edge
  geometry?: EdgeView
  readLabelText?: (label: EdgeLabel) => {
    text: string
    editing: boolean
  }
  measureLabel?: (label: EdgeLabel & { text: string }) => Size | undefined
}): ProjectedEdgeRoute => {
  const textMode = input.edge.textMode ?? 'horizontal'
  const labels = (input.edge.labels ? entityTable.read.list(input.edge.labels) : []).flatMap((label) => {
    const resolved = input.readLabelText?.(label)
    const text = resolved?.text ?? label.text ?? ''
    const displayText = readEdgeLabelDisplayText(text, Boolean(resolved?.editing))
    if (!displayText.trim()) {
      return []
    }

    const measuredLabel = label.text === displayText
      ? label
      : {
          ...label,
          text: displayText
        }
    const measuredSize = input.measureLabel?.(measuredLabel as EdgeLabel & {
      text: string
    })
    const size = resolveEdgeLabelPlacementSize({
      textMode,
      measuredSize,
      text: displayText,
      fontSize: label.style?.size
    })
    if (!size) {
      return []
    }

    const placement = input.geometry
      ? resolveEdgeLabelPlacement({
          path: input.geometry.path,
          t: label.t,
          offset: label.offset,
          textMode,
          labelSize: size,
          sideGap: readEdgeLabelSideGap(textMode)
        })
      : undefined
    if (!placement) {
      return []
    }

    const angle = textMode === 'tangent'
      ? placement.angle
      : 0

    return [{
      labelId: label.id,
      text,
      displayText,
      style: label.style,
      size,
      point: placement.point,
      angle,
      rect: buildEdgeLabelRect(placement.point, size),
      maskRect: buildEdgeLabelMaskRect({
        center: placement.point,
        size,
        angle,
        margin: 4
      })
    }]
  })

  const pathBounds = input.geometry
    ? getEdgePathBounds(input.geometry.path)
    : undefined
  const bounds = geometryApi.rect.boundingRect([
    ...(
      pathBounds
        ? [pathBounds]
        : []
    ),
    ...labels.map((label) => label.rect)
  ])

  return {
    points: input.geometry?.path.points ?? readManualRoutePoints(input.edge),
    segments: input.geometry?.path.segments ?? [],
    svgPath: input.geometry?.path.svgPath,
    bounds,
    pathBounds,
    source: input.geometry?.ends.source.point,
    target: input.geometry?.ends.target.point,
    ends: input.geometry?.ends,
    handles: input.geometry?.handles ?? [],
    labels
  }
}
