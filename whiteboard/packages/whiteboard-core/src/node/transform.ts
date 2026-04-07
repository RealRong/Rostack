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
import type { Guide } from './snap'

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

export type TransformModifiers = {
  alt: boolean
  shift: boolean
}

export type TransformResizeSnapInput = {
  rect: Rect
  source: {
    x?: HorizontalResizeEdge
    y?: VerticalResizeEdge
  }
  minSize: Size
  excludeIds: readonly NodeId[]
  disabled: boolean
}

export type TransformResizeSnapResult = {
  rect: Rect
  guides: readonly Guide[]
}

export type TransformResizeSnapResolver = (
  input: TransformResizeSnapInput
) => TransformResizeSnapResult

export type TransformSpec<TNode extends Node> =
  | {
      kind: 'single-resize'
      pointerId: number
      target: TransformSelectionMember<TNode>
      handle: ResizeDirection
      rotation: number
      startScreen: Point
    }
  | {
      kind: 'single-rotate'
      pointerId: number
      target: TransformSelectionMember<TNode>
      rotation: number
      startWorld: Point
    }
  | {
      kind: 'multi-scale'
      pointerId: number
      box: Rect
      targets: readonly TransformSelectionMember<TNode>[]
      commitIds: ReadonlySet<NodeId>
      handle: ResizeDirection
      startScreen: Point
    }

type TransformStateBase<TNode extends Node> = {
  pointerId: number
  patches: readonly TransformPreviewPatch[]
  commitTargets: readonly TransformSelectionMember<TNode>[]
  commitIds?: ReadonlySet<NodeId>
}

export type TransformState<TNode extends Node> =
  | (TransformStateBase<TNode> & {
      kind: 'single-resize'
      target: TransformSelectionMember<TNode>
      drag: ResizeGestureSnapshot
    })
  | (TransformStateBase<TNode> & {
      kind: 'single-rotate'
      target: TransformSelectionMember<TNode>
      drag: RotateGestureSnapshot
    })
  | (TransformStateBase<TNode> & {
      kind: 'multi-scale'
      box: Rect
      targets: readonly TransformSelectionMember<TNode>[]
      drag: ResizeGestureSnapshot
    })

export type TransformDraft = {
  nodePatches: readonly TransformPreviewPatch[]
  guides: readonly Guide[]
}

export type TransformCommit = readonly TransformCommitUpdate[]

export type TransformStepInput<TNode extends Node> = {
  state: TransformState<TNode>
  screen: Point
  world: Point
  modifiers: TransformModifiers
  zoom: number
  minSize: Size
  rotateSnapStep?: number
  zoomEpsilon?: number
  snap?: TransformResizeSnapResolver
}

export type TransformStepResult<TNode extends Node> = {
  state: TransformState<TNode>
  draft: TransformDraft
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
  resizeDirections?: readonly ResizeDirection[]
  canRotate: boolean
  rotateHandleOffset: number
  zoom: number
  zoomEpsilon?: number
}): TransformHandle[] => {
  const {
    rect,
    rotation,
    canResize,
    resizeDirections,
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
    ? (resizeDirections ?? (Object.keys(positions) as ResizeDirection[])).map((direction) => ({
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

const createResizeDrag = (input: {
  handle: ResizeDirection
  rect: Rect
  rotation: number
  startScreen: Point
}): ResizeGestureSnapshot => ({
  handle: input.handle,
  startScreen: input.startScreen,
  startCenter: getRectCenter(input.rect),
  startRotation: input.rotation,
  startSize: {
    width: input.rect.width,
    height: input.rect.height
  },
  startAspect: input.rect.width / Math.max(input.rect.height, ZOOM_EPSILON)
})

const createRotateDrag = (input: {
  rect: Rect
  rotation: number
  startWorld: Point
}): RotateGestureSnapshot => {
  const center = getRectCenter(input.rect)

  return {
    center,
    startAngle: Math.atan2(
      input.startWorld.y - center.y,
      input.startWorld.x - center.x
    ),
    startRotation: input.rotation
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

export const startTransform = <
  TNode extends Node
>(
  spec: TransformSpec<TNode>
): TransformState<TNode> => {
  switch (spec.kind) {
    case 'single-resize':
      return {
        kind: 'single-resize',
        pointerId: spec.pointerId,
        target: spec.target,
        drag: createResizeDrag({
          handle: spec.handle,
          rect: spec.target.rect,
          rotation: spec.rotation,
          startScreen: spec.startScreen
        }),
        patches: [],
        commitTargets: [spec.target]
      }
    case 'single-rotate':
      return {
        kind: 'single-rotate',
        pointerId: spec.pointerId,
        target: spec.target,
        drag: createRotateDrag({
          rect: spec.target.rect,
          rotation: spec.rotation,
          startWorld: spec.startWorld
        }),
        patches: [],
        commitTargets: [spec.target]
      }
    case 'multi-scale':
      return {
        kind: 'multi-scale',
        pointerId: spec.pointerId,
        box: spec.box,
        targets: spec.targets,
        drag: createResizeDrag({
          handle: spec.handle,
          rect: spec.box,
          rotation: 0,
          startScreen: spec.startScreen
        }),
        patches: [],
        commitTargets: spec.targets,
        commitIds: spec.commitIds
      }
  }
}

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

const stepResizeTransform = <
  TNode extends Node
>(
  state: Extract<TransformState<TNode>, {
    kind: 'single-resize' | 'multi-scale'
  }>,
  input: TransformStepInput<TNode>
): TransformStepResult<TNode> => {
  const rawRect = computeResizeRect({
    drag: state.drag,
    currentScreen: input.screen,
    zoom: Math.max(input.zoom, input.zoomEpsilon ?? ZOOM_EPSILON),
    minSize: input.minSize,
    altKey: input.modifiers.alt,
    shiftKey: input.modifiers.shift,
    zoomEpsilon: input.zoomEpsilon
  }).rect
  const { sourceX, sourceY } = getResizeSourceEdges(state.drag.handle)
  const snap = input.snap?.({
    rect: rawRect,
    source: {
      x: sourceX,
      y: sourceY
    },
    minSize: input.minSize,
    excludeIds:
      state.kind === 'single-resize'
        ? [state.target.id]
        : state.targets.map((target) => target.id),
    disabled: input.modifiers.alt || state.drag.startRotation !== 0
  })
  const nextRect = snap?.rect ?? rawRect
  const guides = snap?.guides ?? []
  const patches = state.kind === 'single-resize'
    ? projectResizeTransformPatches({
        startRect: state.target.rect,
        nextRect,
        targets: [state.target]
      })
    : projectResizeTransformPatches({
        startRect: state.box,
        nextRect,
        targets: state.targets
      })

  return {
    state: {
      ...state,
      patches
    },
    draft: {
      nodePatches: patches,
      guides
    }
  }
}

const stepRotateTransform = <
  TNode extends Node
>(
  state: Extract<TransformState<TNode>, { kind: 'single-rotate' }>,
  input: TransformStepInput<TNode>
): TransformStepResult<TNode> => {
  const rotation = computeNextRotation({
    drag: state.drag,
    currentPoint: input.world,
    shiftKey: input.modifiers.shift,
    rotateSnapStep: input.rotateSnapStep
  })
  const patches = projectRotateTransformPatches({
    targetId: state.target.id,
    rotation
  })

  return {
    state: {
      ...state,
      patches
    },
    draft: {
      nodePatches: patches,
      guides: []
    }
  }
}

export const stepTransform = <
  TNode extends Node
>(
  input: TransformStepInput<TNode>
): TransformStepResult<TNode> => {
  switch (input.state.kind) {
    case 'single-resize':
    case 'multi-scale':
      return stepResizeTransform(input.state, input)
    case 'single-rotate':
      return stepRotateTransform(input.state, input)
  }
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

export const finishTransform = <
  TNode extends Node
>(
  state: TransformState<TNode>
): TransformCommit => buildTransformCommitUpdates({
    targets: state.commitTargets,
    patches: state.patches,
    commitTargetIds: state.commitIds
  })
