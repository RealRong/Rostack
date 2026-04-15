import {
  buildTransformCommitUpdates,
  getResizeUpdateRect,
  startTransform,
  stepTransform,
  type TransformPreviewPatch,
  type TransformSelectionMember,
  type TransformSpec
} from '@whiteboard/core/node'
import type { Node } from '@whiteboard/core/types'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import { FINISH } from '@whiteboard/editor/input/core/result'
import { createSelectionGesture } from '@whiteboard/editor/input/core/gesture'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { PointerDownInput } from '@whiteboard/editor/types/input'
import type { TextPreviewPatch } from '@whiteboard/editor/local/feedback/types'

export type TransformTarget = TransformSelectionMember<Node>
export type RuntimeTransformSpec = TransformSpec<Node>

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

const readTransformTextPreview = (
  patch: TransformPreviewPatch
): TextPreviewPatch | undefined => (
  patch.fontSize === undefined
  && patch.mode === undefined
  && patch.wrapWidth === undefined
  && patch.handle === undefined
)
  ? undefined
  : {
      fontSize: patch.fontSize,
      mode: patch.mode,
      wrapWidth: patch.wrapWidth,
      handle: patch.handle
    }

type TransformProjectInput = Pick<
  PointerDownInput,
  'screen' | 'world' | 'modifiers'
>

const isTransformProjectInputEqual = (
  left: TransformProjectInput | null,
  right: TransformProjectInput
) => (
  left !== null
  && left.screen.x === right.screen.x
  && left.screen.y === right.screen.y
  && left.world.x === right.world.x
  && left.world.y === right.world.y
  && left.modifiers.alt === right.modifiers.alt
  && left.modifiers.shift === right.modifiers.shift
  && left.modifiers.ctrl === right.modifiers.ctrl
  && left.modifiers.meta === right.modifiers.meta
)

const copyTransformProjectInput = (
  input: TransformProjectInput
): TransformProjectInput => ({
  screen: {
    x: input.screen.x,
    y: input.screen.y
  },
  world: {
    x: input.world.x,
    y: input.world.y
  },
  modifiers: {
    alt: input.modifiers.alt,
    shift: input.modifiers.shift,
    ctrl: input.modifiers.ctrl,
    meta: input.modifiers.meta
  }
})

export const createTransformSession = (
  ctx: InteractionContext,
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = startTransform(spec)
  let modifiers = start.modifiers
  let activeTextPreviewIds: readonly string[] = []
  let lastProjectedInput: TransformProjectInput | null = null
  let interaction = null as InteractionSession | null

  const project = (
    input: TransformProjectInput
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
    const nextPatches = ctx.layout.resolvePreviewPatches(result.state.patches)
    state = {
      ...result.state,
      patches: nextPatches
    }

    const nextActiveTextPreviewIds = nextPatches.flatMap((patch) => {
      const textPreview = readTransformTextPreview(patch)
      if (!textPreview) {
        return []
      }

      return [patch.id]
    })
    const nextActiveTextPreviewIdSet = new Set(nextActiveTextPreviewIds)

    activeTextPreviewIds.forEach((nodeId) => {
      if (!nextActiveTextPreviewIdSet.has(nodeId)) {
        ctx.local.feedback.node.text.clear(nodeId)
      }
    })

    nextPatches.forEach((patch) => {
      const textPreview = readTransformTextPreview(patch)
      if (!textPreview) {
        return
      }

      ctx.local.feedback.node.text.clearSize(patch.id)
      ctx.local.feedback.node.text.set(patch.id, textPreview)
    })
    activeTextPreviewIds = nextActiveTextPreviewIds

    interaction!.gesture = createSelectionGesture(
      'selection-transform',
      {
        nodePatches: toTransformNodePatches(nextPatches),
        edgePatches: [],
        frameHoverId: undefined,
        marquee: undefined,
        guides: result.draft.guides
      }
    )
    lastProjectedInput = copyTransformProjectInput(input)
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
      if (!isTransformProjectInputEqual(lastProjectedInput, input)) {
        project(input)
      }

      const updates = buildTransformCommitUpdates({
        targets: state.commitTargets,
        patches: state.patches,
        commitTargetIds: state.commitIds
      })
      if (updates.length > 0) {
        ctx.command.node.updateMany(updates)
      }

      activeTextPreviewIds.forEach((nodeId) => {
        ctx.local.feedback.node.text.clear(nodeId)
      })
      activeTextPreviewIds = []
      lastProjectedInput = null

      return FINISH
    },
    cleanup: () => {
      activeTextPreviewIds.forEach((nodeId) => {
        ctx.local.feedback.node.text.clear(nodeId)
      })
      activeTextPreviewIds = []
      lastProjectedInput = null
    }
  }

  return interaction
}
