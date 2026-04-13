import {
  finishTransform,
  getResizeUpdateRect,
  startTransform,
  stepTransform,
  type TransformPreviewPatch,
  type TransformState,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node } from '@whiteboard/core/types'
import type { InteractionSession } from '../core/types'
import { FINISH } from '../core/result'
import { createSelectionGesture } from '../core/gesture'
import type { InteractionContext } from '../context'
import type { PointerDownInput } from '../../types/input'
import type { TransformPickHandle } from '../../types/pick'
import {
  commitTextTransform,
  projectTextTransform
} from './text'

export type TransformTarget = TransformSelectionMember<Node>
export type TextTransformMode = 'reflow' | 'scale'
export type RuntimeTransformSpec =
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

const RESIZE_MIN_SIZE = {
  width: 20,
  height: 20
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

export const createTransformSession = (
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
      zoom: ctx.query.viewport.get().zoom,
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
          screen: ctx.query.viewport.screenPoint(pointer.clientX, pointer.clientY),
          world: ctx.query.viewport.pointer(pointer).world,
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
        ctx.command.node.updateMany(updates)
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

export const createSingleTextTransformSession = (
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
  let modifiers = start.modifiers
  let interaction = null as InteractionSession | null

  const project = (
    input: Pick<PointerDownInput, 'screen' | 'modifiers'>
  ) => {
    modifiers = input.modifiers
    const result = projectTextTransform({
      drag: baseState.drag,
      mode: spec.mode,
      target: spec.target,
      handle: spec.handle,
      screen: input.screen,
      zoom: ctx.query.viewport.get().zoom,
      minSize: RESIZE_MIN_SIZE,
      snap: ctx.snap.node.resize
    })

    interaction!.gesture = createSelectionGesture(
      'selection-transform',
      {
        nodePatches: [],
        edgePatches: [],
        frameHoverId: undefined,
        marquee: undefined,
        guides: result.guides
      }
    )

    ctx.local.feedback.node.text.set(
      spec.target.id,
      result.preview
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
          screen: ctx.query.viewport.screenPoint(pointer.clientX, pointer.clientY),
          modifiers
        })
      }
    },
    move: (input) => {
      project(input)
    },
    up: (input) => {
      project(input)

      const previewItem = ctx.query.node.item.get(spec.target.id)
      ctx.local.feedback.node.text.clear(spec.target.id)

      if (!previewItem) {
        return FINISH
      }

      const update = commitTextTransform({
        target: spec.target,
        mode: spec.mode,
        preview: {
          node: previewItem.node,
          rect: previewItem.rect
        }
      })

      if (update) {
        ctx.command.node.update(spec.target.id, update)
      }

      return FINISH
    },
    cleanup: () => {
      ctx.local.feedback.node.text.clear(spec.target.id)
    }
  }

  return interaction
}
