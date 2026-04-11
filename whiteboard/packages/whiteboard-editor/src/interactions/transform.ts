import {
  computeResizeRect,
  finishTransform,
  getResizeSourceEdges,
  getResizeUpdateRect,
  readTextWrapWidth,
  readTextWidthMode,
  resolveTextHandle,
  startTransform,
  stepTransform,
  TEXT_DEFAULT_FONT_SIZE,
  toTransformCommitPatch,
  type TransformPreviewPatch,
  type TransformState,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node, NodeId } from '@whiteboard/core/types'
import type {
  InteractionBinding,
  InteractionSession
} from '../runtime/interaction/types'
import { FINISH } from '../runtime/interaction/result'
import type { InteractionContext } from './context'
import { createSelectionGesture } from '../runtime/interaction/gesture'
import type { PointerDownInput } from '../types/input'
import type { TransformPickHandle } from '../types/pick'
import {
  dataUpdate,
  mergeNodeUpdates,
  styleUpdate
} from '../runtime/node/patch'

type TransformTarget = TransformSelectionMember<Node>
type TextTransformMode = 'reflow' | 'scale'
type RuntimeTransformSpec =
  | TransformSpec<Node>
  | {
      kind: 'single-text'
      mode: TextTransformMode
      pointerId: number
      target: TransformTarget
      handle: NonNullable<TransformPickHandle['direction']>
      rotation: number
      startScreen: PointerDownInput['client']
    }

const readNodeRotation = (
  node: Node
) => (typeof node.rotation === 'number' ? node.rotation : 0)

const RESIZE_MIN_SIZE = {
  width: 20,
  height: 20
}

const readTextFontSize = (
  node: Node
) => (
  typeof node.style?.fontSize === 'number'
    ? node.style.fontSize
    : TEXT_DEFAULT_FONT_SIZE
)

const readTextScaleMinSize = (
  rect: TransformTarget['rect']
) => {
  const widthRatio = RESIZE_MIN_SIZE.width / Math.max(rect.width, 0.0001)
  const heightRatio = RESIZE_MIN_SIZE.height / Math.max(rect.height, 0.0001)
  const ratio = Math.max(widthRatio, heightRatio)

  return {
    width: rect.width * ratio,
    height: rect.height * ratio
  }
}

const toTransformNodePatches = (
  patches: readonly TransformPreviewPatch[]
) => patches.map(({
  id,
  position,
  size,
  rotation
}) => ({
  id,
  patch: {
    position,
    size,
    rotation
  }
}))

const readTransformTarget = (
  ctx: InteractionContext,
  nodeId: NodeId
): TransformTarget | undefined => {
  const entry = ctx.read.node.canvas.get(nodeId)

  return entry
    ? {
      id: entry.node.id,
      node: entry.node,
      rect: entry.geometry.rect
    }
    : undefined
}

const readNodeTransformSpec = (
  ctx: InteractionContext,
  nodeId: NodeId,
  handle: TransformPickHandle,
  input: PointerDownInput
): RuntimeTransformSpec | undefined => {
  const entry = ctx.read.node.canvas.get(nodeId)
  if (!entry || entry.node.locked) {
    return undefined
  }

  const capability = ctx.read.node.capability(entry.node)
  const target = readTransformTarget(ctx, nodeId)
  if (!target) {
    return undefined
  }

  if (handle.kind === 'resize') {
    if (!handle.direction || !capability.resize) {
      return undefined
    }

    if (entry.node.type === 'text') {
      const mode = resolveTextHandle(handle.direction)
      if (mode === 'none') {
        return undefined
      }

      return {
        kind: 'single-text',
        mode,
        pointerId: input.pointerId,
        target,
        handle: handle.direction,
        rotation: readNodeRotation(entry.node),
        startScreen: input.client
      }
    }

    return {
      kind: 'single-resize',
      pointerId: input.pointerId,
      target,
      handle: handle.direction,
      rotation: readNodeRotation(entry.node),
      startScreen: input.client
    }
  }

  if (!capability.rotate) {
    return undefined
  }

  return {
    kind: 'single-rotate',
    pointerId: input.pointerId,
    target,
    rotation: readNodeRotation(entry.node),
    startWorld: input.world
  }
}

const readSelectionTransformSpec = (
  ctx: InteractionContext,
  handle: TransformPickHandle,
  input: PointerDownInput
): TransformSpec<Node> | undefined => {
  const selectionModel = ctx.selection.get()
  const selection = selectionModel.summary
  const affordance = selectionModel.affordance
  if (
    !affordance.transformBox
    || handle.kind !== 'resize'
    || !handle.direction
    || !affordance.canResize
  ) {
    return undefined
  }

  const resolved = ctx.read.node.transformTargets(selection.target.nodeIds)
  if (!resolved?.targets.length) {
    return undefined
  }

  return {
    kind: 'multi-scale',
    pointerId: input.pointerId,
    box: affordance.transformBox,
    targets: resolved.targets as readonly TransformTarget[],
    commitIds: resolved.commitIds,
    handle: handle.direction,
    startScreen: input.client
  }
}

const resolveTransformSpec = (
  ctx: InteractionContext,
  input: PointerDownInput
): RuntimeTransformSpec | null => {
  const tool = ctx.read.tool.get()
  if (
    tool.type !== 'select'
    || (input.pick.kind !== 'node' && input.pick.kind !== 'selection-box')
    || input.pick.part !== 'transform'
    || !input.pick.handle
  ) {
    return null
  }

  if (input.pick.kind === 'node') {
    return readNodeTransformSpec(ctx, input.pick.id, input.pick.handle, input) ?? null
  }

  return readSelectionTransformSpec(ctx, input.pick.handle, input) ?? null
}

const createTransformSession = (
  ctx: InteractionContext,
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = startTransform(spec)
  let modifiers = start.modifiers
  let interaction = null as InteractionSession | null

  const project = (
    input: Pick<PointerDownInput, 'screen' | 'world' | 'modifiers'>
  ) => {
    modifiers = input.modifiers
    const result = stepTransform({
      state,
      screen: input.screen,
      world: input.world,
      modifiers: {
        alt: input.modifiers.alt,
        shift: input.modifiers.shift
      },
      zoom: ctx.read.viewport.get().zoom,
      minSize: RESIZE_MIN_SIZE,
      snap: (resize) => {
        const snapped = ctx.snap.node.resize(resize)
        return {
          rect: getResizeUpdateRect(snapped.update),
          guides: snapped.guides
        }
      }
    })
    state = result.state
    interaction!.gesture = createSelectionGesture(
      'selection-transform',
      {
        nodePatches: toTransformNodePatches(result.draft.nodePatches),
        edgePatches: [],
        frameHoverId: undefined,
        marquee: undefined,
        guides: result.draft.guides
      }
    )
  }

  interaction = {
    mode: 'node-transform',
    pointerId: spec.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        project({
          screen: ctx.read.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.read.viewport.pointer(pointer).world,
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)

      const updates = finishTransform(state)
      if (updates.length > 0) {
        ctx.write.document.node.updateMany(updates)
      }

      return FINISH
    },
    cleanup: () => { }
  }

  return interaction
}

const createSingleTextTransformSession = (
  ctx: InteractionContext,
  spec: Extract<RuntimeTransformSpec, { kind: 'single-text' }>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  const baseState = startTransform({
    kind: 'single-resize',
    pointerId: spec.pointerId,
    target: spec.target,
    handle: spec.handle,
    rotation: spec.rotation,
    startScreen: spec.startScreen
  }) as Extract<TransformState<Node>, { kind: 'single-resize' }>
  const startFontSize = readTextFontSize(spec.target.node)
  const startWidthMode = readTextWidthMode(spec.target.node)
  let modifiers = start.modifiers
  let interaction = null as InteractionSession | null

  const project = (
    input: Pick<PointerDownInput, 'screen' | 'modifiers'>
  ) => {
    modifiers = input.modifiers
    const zoom = ctx.read.viewport.get().zoom
    const rawRect = spec.mode === 'reflow'
      ? computeResizeRect({
          drag: baseState.drag,
          currentScreen: input.screen,
          zoom,
          minSize: RESIZE_MIN_SIZE,
          altKey: false,
          shiftKey: false
        }).rect
      : computeResizeRect({
          drag: baseState.drag,
          currentScreen: input.screen,
          zoom,
          minSize: readTextScaleMinSize(spec.target.rect),
          altKey: false,
          shiftKey: true
        }).rect
    const { sourceX, sourceY } = getResizeSourceEdges(baseState.drag.handle)
    const snapped = ctx.snap.node.resize({
      rect: rawRect,
      source: {
        x: sourceX,
        y: sourceY
      },
      minSize: RESIZE_MIN_SIZE,
      excludeIds: [spec.target.id],
      disabled: baseState.drag.startRotation !== 0
    })
    const nextRect = getResizeUpdateRect(snapped.update)
    const nextFontSize = spec.mode === 'scale'
      ? Math.max(
          1,
          startFontSize * (
            nextRect.width / Math.max(spec.target.rect.width, 0.0001)
          )
        )
      : undefined

    interaction!.gesture = createSelectionGesture(
      'selection-transform',
      {
        nodePatches: [],
        edgePatches: [],
        frameHoverId: undefined,
        marquee: undefined,
        guides: snapped.guides
      }
    )

    ctx.write.preview.node.text.set(
      spec.target.id,
      {
        position: {
          x: nextRect.x,
          y: nextRect.y
        },
        size: {
          width: nextRect.width,
          height: nextRect.height
        },
        mode: spec.mode === 'reflow'
          ? 'wrap'
          : startWidthMode,
        wrapWidth: spec.mode === 'reflow' || startWidthMode === 'wrap'
          ? nextRect.width
          : undefined,
        handle: spec.handle,
        ...(spec.mode === 'scale'
          ? {
              fontSize: nextFontSize
            }
          : {})
      }
    )
  }

  interaction = {
    mode: 'node-transform',
    pointerId: spec.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        project({
          screen: ctx.read.viewport.screenPoint(pointer.clientX, pointer.clientY),
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)

      const previewItem = ctx.read.node.item.get(spec.target.id)
      ctx.write.preview.node.text.clear(spec.target.id)

      if (!previewItem) {
        return FINISH
      }

      const geometry = toTransformCommitPatch(spec.target.node, {
        position: {
          x: previewItem.rect.x,
          y: previewItem.rect.y
        },
        size: {
          width: previewItem.rect.width,
          height: previewItem.rect.height
        }
      })
      const nextFontSize = previewItem.node.type === 'text'
        ? Math.max(1, Math.round(readTextFontSize(previewItem.node)))
        : undefined
      const update = mergeNodeUpdates(
        geometry
          ? {
              fields: geometry
            }
          : undefined,
        spec.mode === 'reflow' && readTextWidthMode(spec.target.node) !== 'wrap'
          ? dataUpdate('widthMode', 'wrap')
          : undefined,
        readTextWidthMode(previewItem.node) === 'wrap'
        && readTextWrapWidth(spec.target.node) !== previewItem.rect.width
          ? dataUpdate('wrapWidth', previewItem.rect.width)
          : spec.mode === 'scale'
            && readTextWidthMode(previewItem.node) === 'auto'
            && readTextWrapWidth(spec.target.node) !== undefined
              ? dataUpdate('wrapWidth', undefined)
          : undefined,
        spec.mode === 'scale' && nextFontSize !== readTextFontSize(spec.target.node)
          ? styleUpdate('fontSize', nextFontSize)
          : undefined
      )

      if (update.fields || update.records?.length) {
        ctx.write.document.node.update(spec.target.id, update)
      }

      return FINISH
    },
    cleanup: () => {
      ctx.write.preview.node.text.clear(spec.target.id)
    }
  }

  return interaction
}

export const startTransformInteraction = (
  ctx: InteractionContext,
  input: PointerDownInput
) => {
  const spec = resolveTransformSpec(ctx, input)

  return spec
    ? spec.kind === 'single-text'
      ? createSingleTextTransformSession(ctx, spec, {
          modifiers: input.modifiers
        })
      : createTransformSession(ctx, spec, {
          modifiers: input.modifiers
        })
    : null
}

export const createTransformInteraction = (
  ctx: InteractionContext
): InteractionBinding => ({
  key: 'transform',
  start: (input) => startTransformInteraction(ctx, input)
})
