import {
  finishTransform,
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

export const createTransformSession = (
  ctx: InteractionContext,
  spec: TransformSpec<Node>,
  start: Pick<PointerDownInput, 'modifiers'>
): InteractionSession => {
  let state = startTransform(spec)
  let modifiers = start.modifiers
  let activeTextPreviewIds: readonly string[] = []
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

    activeTextPreviewIds.forEach((nodeId) => {
      ctx.local.feedback.node.text.clear(nodeId)
    })
    activeTextPreviewIds = result.draft.nodePatches
      .filter((patch) => readTransformTextPreview(patch))
      .map((patch) => {
        const textPreview = readTransformTextPreview(patch)
        if (textPreview) {
          ctx.local.feedback.node.text.set(patch.id, textPreview)
        }
        return patch.id
      })

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

      activeTextPreviewIds.forEach((nodeId) => {
        ctx.local.feedback.node.text.clear(nodeId)
      })
      activeTextPreviewIds = []

      return FINISH
    },
    cleanup: () => {
      activeTextPreviewIds.forEach((nodeId) => {
        ctx.local.feedback.node.text.clear(nodeId)
      })
      activeTextPreviewIds = []
    }
  }

  return interaction
}
