import type {
  Node,
  NodeFieldPatch,
  NodeId,
  Point,
  Rect,
  Size
} from '../types'
import {
  getRectCenter,
  isPointEqual,
  isSizeEqual,
  rotatePoint
} from '../geometry'
import {
  getGroupDescendants,
  isContainerNode
} from './group'
import { filterRootIds } from './owner'

type ResizeHandleMeta = {
  sx: -1 | 0 | 1
  sy: -1 | 0 | 1
  cursor: string
}

export type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'
export type HorizontalResizeEdge = 'left' | 'right'
export type VerticalResizeEdge = 'top' | 'bottom'

export type TransformHandle = {
  id: string
  kind: 'resize' | 'rotate'
  direction?: ResizeDirection
  position: Point
  cursor: string
}

export type ResizeUpdate = {
  position: Point
  size: Size
}

export type ResizeGestureSnapshot = {
  handle: ResizeDirection
  startScreen: Point
  startCenter: Point
  startRotation: number
  startSize: Size
  startAspect: number
}

export type RotateGestureSnapshot = {
  center: Point
  startAngle: number
  startRotation: number
}

export type ResizeGestureInput = {
  drag: ResizeGestureSnapshot
  currentScreen: Point
  minSize: Size
  zoom: number
  altKey: boolean
  shiftKey: boolean
  zoomEpsilon?: number
}

export type RotateGestureInput = {
  drag: RotateGestureSnapshot
  currentPoint: Point
  shiftKey: boolean
  rotateSnapStep?: number
}

export type TransformPreviewPatch = {
  id: NodeId
  position?: Point
  size?: Size
  rotation?: number
}

export type TransformProjectionMember = {
  id: NodeId
  rect: Rect
}

export type TransformSelectionMember<TNode extends Pick<Node, 'id' | 'type' | 'children'>> = {
  id: NodeId
  node: TNode
  rect: Rect
}

export type TransformSelectionTargets<TNode extends Pick<Node, 'id' | 'type' | 'children'>> = {
  targets: readonly TransformSelectionMember<TNode>[]
  commitIds: ReadonlySet<NodeId>
}

export type TransformCommitUpdate = {
  id: NodeId
  update: {
    fields: NodeFieldPatch
  }
}

const ZOOM_EPSILON = 0.0001

export const resizeHandleMap: Record<ResizeDirection, ResizeHandleMeta> = {
  nw: { sx: -1, sy: -1, cursor: 'nwse-resize' },
  n: { sx: 0, sy: -1, cursor: 'ns-resize' },
  ne: { sx: 1, sy: -1, cursor: 'nesw-resize' },
  e: { sx: 1, sy: 0, cursor: 'ew-resize' },
  se: { sx: 1, sy: 1, cursor: 'nwse-resize' },
  s: { sx: 0, sy: 1, cursor: 'ns-resize' },
  sw: { sx: -1, sy: 1, cursor: 'nesw-resize' },
  w: { sx: -1, sy: 0, cursor: 'ew-resize' }
}

export const getResizeSourceEdges = (
  handle: ResizeDirection
): { sourceX?: HorizontalResizeEdge; sourceY?: VerticalResizeEdge } => {
  const sourceX: HorizontalResizeEdge | undefined = handle.includes('w')
    ? 'left'
    : handle.includes('e')
      ? 'right'
      : undefined
  const sourceY: VerticalResizeEdge | undefined = handle.includes('n')
    ? 'top'
    : handle.includes('s')
      ? 'bottom'
      : undefined
  return { sourceX, sourceY }
}

export const rotateVector = (vector: Point, rotation: number) =>
  rotatePoint(vector, { x: 0, y: 0 }, rotation)

export const toTransformCommitPatch = (
  node: Node,
  preview: Pick<TransformPreviewPatch, 'position' | 'size' | 'rotation'>
): NodeFieldPatch | undefined => {
  const patch: NodeFieldPatch = {}
  const position = node.type === 'group' ? undefined : node.position
  const size = node.type === 'group' ? undefined : node.size
  const rotation = node.type === 'group' ? undefined : node.rotation

  if (preview.position && !isPointEqual(preview.position, position)) {
    patch.position = preview.position
  }
  if (preview.size && !isSizeEqual(preview.size, size)) {
    patch.size = preview.size
  }
  if (
    typeof preview.rotation === 'number'
    && preview.rotation !== (rotation ?? 0)
  ) {
    patch.rotation = preview.rotation
  }

  if (!patch.position && !patch.size && patch.rotation === undefined) {
    return undefined
  }

  return patch
}

export const buildTransformHandles = (options: {
  rect: Rect
  rotation: number
  canResize: boolean
  canRotate: boolean
  rotateHandleOffset: number
  zoom: number
  zoomEpsilon?: number
}): TransformHandle[] => {
  const {
    rect,
    rotation,
    canResize,
    canRotate,
    rotateHandleOffset,
    zoom,
    zoomEpsilon = 0.0001
  } = options
  const center = getRectCenter(rect)
  const cx = rect.x + rect.width / 2
  const cy = rect.y + rect.height / 2
  const localPositions: Record<ResizeDirection, Point> = {
    nw: { x: rect.x, y: rect.y },
    n: { x: cx, y: rect.y },
    ne: { x: rect.x + rect.width, y: rect.y },
    e: { x: rect.x + rect.width, y: cy },
    se: { x: rect.x + rect.width, y: rect.y + rect.height },
    s: { x: cx, y: rect.y + rect.height },
    sw: { x: rect.x, y: rect.y + rect.height },
    w: { x: rect.x, y: cy }
  }
  const positions = Object.fromEntries(
    (Object.keys(localPositions) as ResizeDirection[]).map((direction) => [
      direction,
      rotatePoint(localPositions[direction], center, rotation)
    ])
  ) as Record<ResizeDirection, Point>
  const resizeHandles = canResize
    ? (Object.keys(positions) as ResizeDirection[]).map((direction) => ({
        id: `resize-${direction}`,
        kind: 'resize' as const,
        direction,
        position: positions[direction],
        cursor: resizeHandleMap[direction].cursor
      }))
    : []
  if (!canRotate) return resizeHandles

  const offsetWorld = rotateHandleOffset / Math.max(zoom, zoomEpsilon)
  const diagonal = rotateVector(
    { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
    rotation
  )
  const bottomLeft = positions.sw
  return [
    ...resizeHandles,
    {
      id: 'rotate',
      kind: 'rotate',
      position: {
        x: bottomLeft.x + diagonal.x * offsetWorld,
        y: bottomLeft.y + diagonal.y * offsetWorld
      },
      cursor: 'grab'
    }
  ]
}

export const computeResizeRect = (options: ResizeGestureInput) => {
  const {
    drag,
    currentScreen,
    minSize,
    zoom,
    altKey,
    shiftKey,
    zoomEpsilon = 0.0001
  } = options
  const {
    handle,
    startScreen,
    startCenter,
    startRotation,
    startSize,
    startAspect
  } = drag
  const safeZoom = Math.max(zoom, zoomEpsilon)
  const deltaWorld = {
    x: (currentScreen.x - startScreen.x) / safeZoom,
    y: (currentScreen.y - startScreen.y) / safeZoom
  }
  const localDelta = rotateVector(deltaWorld, -startRotation)
  const { sx, sy } = resizeHandleMap[handle]

  let width = startSize.width
  let height = startSize.height
  if (sx !== 0) {
    width += localDelta.x * sx * (altKey ? 2 : 1)
  }
  if (sy !== 0) {
    height += localDelta.y * sy * (altKey ? 2 : 1)
  }
  if (shiftKey && sx !== 0 && sy !== 0) {
    if (Math.abs(localDelta.x) > Math.abs(localDelta.y)) {
      height = width / startAspect
    } else {
      width = height * startAspect
    }
  }

  width = Math.max(minSize.width, width)
  height = Math.max(minSize.height, height)

  let centerOffset = { x: 0, y: 0 }
  if (!altKey) {
    if (sx !== 0) {
      centerOffset.x = ((width - startSize.width) * sx) / 2
    }
    if (sy !== 0) {
      centerOffset.y = ((height - startSize.height) * sy) / 2
    }
  }
  const worldCenterOffset = rotateVector(centerOffset, startRotation)
  const nextCenter = {
    x: startCenter.x + worldCenterOffset.x,
    y: startCenter.y + worldCenterOffset.y
  }

  return {
    width,
    height,
    rect: {
      x: nextCenter.x - width / 2,
      y: nextCenter.y - height / 2,
      width,
      height
    }
  }
}

export const getResizeUpdateRect = (
  update: ResizeUpdate
): Rect => ({
  x: update.position.x,
  y: update.position.y,
  width: update.size.width,
  height: update.size.height
})

const scaleAxis = (
  startValue: number,
  startOrigin: number,
  scale: number,
  nextOrigin: number
) => nextOrigin + (startValue - startOrigin) * scale

export const projectResizePatches = (options: {
  startRect: Rect
  nextRect: Rect
  members: readonly TransformProjectionMember[]
}): TransformPreviewPatch[] => {
  const scaleX = options.startRect.width > ZOOM_EPSILON
    ? options.nextRect.width / options.startRect.width
    : 1
  const scaleY = options.startRect.height > ZOOM_EPSILON
    ? options.nextRect.height / options.startRect.height
    : 1

  return options.members.map((member) => ({
    id: member.id,
    position: {
      x: scaleAxis(member.rect.x, options.startRect.x, scaleX, options.nextRect.x),
      y: scaleAxis(member.rect.y, options.startRect.y, scaleY, options.nextRect.y)
    },
    size: {
      width: Math.max(1, member.rect.width * scaleX),
      height: Math.max(1, member.rect.height * scaleY)
    }
  }))
}

export const projectResizeTransformPatches = (options: {
  startRect: Rect
  nextRect: Rect
  targets: readonly TransformProjectionMember[]
}): readonly TransformPreviewPatch[] => (
  options.targets.length === 1
    ? [{
        id: options.targets[0]!.id,
        position: {
          x: options.nextRect.x,
          y: options.nextRect.y
        },
        size: {
          width: options.nextRect.width,
          height: options.nextRect.height
        }
      }]
    : projectResizePatches({
        startRect: options.startRect,
        nextRect: options.nextRect,
        members: options.targets
      })
)

export const projectRotateTransformPatches = (options: {
  targetId: NodeId
  rotation: number
}): readonly TransformPreviewPatch[] => [{
  id: options.targetId,
  rotation: options.rotation
}]

export const resolveSelectionTransformTargets = <
  TNode extends Pick<Node, 'id' | 'type' | 'children'>
>(
  members: readonly TransformSelectionMember<TNode>[],
  selectedIds: readonly NodeId[]
): TransformSelectionTargets<TNode> | undefined => {
  if (!members.length || !selectedIds.length) {
    return undefined
  }

  const nodes = members.map((member) => member.node)
  const rootIds = filterRootIds(nodes, selectedIds)
  if (!rootIds.length) {
    return undefined
  }

  const memberIds = new Set<NodeId>()
  const commitIds = new Set<NodeId>()
  const nodeById = new Map(members.map((member) => [member.id, member.node] as const))

  rootIds.forEach((rootId) => {
    const root = nodeById.get(rootId)
    if (!root) {
      return
    }

    memberIds.add(root.id)
    if (root.type !== 'group') {
      commitIds.add(root.id)
      return
    }

    getGroupDescendants(nodes, root.id).forEach((descendant) => {
      if (descendant.type === 'group') {
        memberIds.add(descendant.id)
        return
      }

      if (isContainerNode(descendant)) {
        return
      }

      memberIds.add(descendant.id)
      commitIds.add(descendant.id)
    })
  })

  if (!memberIds.size || !commitIds.size) {
    return undefined
  }

  const targets = members.filter((member) => memberIds.has(member.id))
  if (!targets.length) {
    return undefined
  }

  return {
    targets,
    commitIds
  }
}

export const computeNextRotation = (options: RotateGestureInput) => {
  const {
    drag,
    currentPoint,
    shiftKey,
    rotateSnapStep = 15
  } = options
  const angle = Math.atan2(
    currentPoint.y - drag.center.y,
    currentPoint.x - drag.center.x
  )
  let nextRotation = drag.startRotation + ((angle - drag.startAngle) * 180) / Math.PI
  if (shiftKey) {
    nextRotation = Math.round(nextRotation / rotateSnapStep) * rotateSnapStep
  }
  return nextRotation
}

export const buildTransformCommitUpdates = (options: {
  targets: readonly {
    id: NodeId
    node: Node
  }[]
  patches: readonly TransformPreviewPatch[]
  commitTargetIds?: ReadonlySet<NodeId>
}): readonly TransformCommitUpdate[] => {
  if (!options.patches.length || !options.targets.length) {
    return []
  }

  const commitTargetIds = options.commitTargetIds
    ?? new Set(options.targets.map((target) => target.id))
  const targetById = new Map(
    options.targets.map((target) => [target.id, target] as const)
  )

  return options.patches.flatMap((preview) => {
    if (!commitTargetIds.has(preview.id)) {
      return []
    }

    const target = targetById.get(preview.id)
    if (!target) {
      return []
    }

    const patch = toTransformCommitPatch(target.node, preview)
    if (!patch) {
      return []
    }

    return [{
      id: target.id,
      update: {
        fields: patch
      }
    }]
  })
}
