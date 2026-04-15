import {
  EDGE_LABEL_CENTER_TOLERANCE,
  EDGE_LABEL_RAIL_OFFSET,
  projectPointToEdgeLabelPlacement,
  readEdgeLabelSideGap,
  resolveEdgeLabelPlacementSize
} from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point,
  Size
} from '@whiteboard/core/types'
import type { EdgePathResult } from '@whiteboard/core/types/edge'
import {
  GestureTuning
} from '@whiteboard/editor/input/core/config'
import { createEdgeGesture } from '@whiteboard/editor/input/core/gesture'
import {
  FINISH,
  replaceSession
} from '@whiteboard/editor/input/core/result'
import type { InteractionContext } from '@whiteboard/editor/input/context'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import {
  readEdgeLabelTextSourceId
} from '@whiteboard/editor/types/layout'
import type {
  PointerDownInput,
  PointerMoveInput
} from '@whiteboard/editor/types/input'

const EDGE_LABEL_PLACEHOLDER = 'Label'

type EdgeLabelDragDraft = {
  t: number
  offset: number
}

type EdgeLabelDragState = {
  edge: Edge
  edgeId: EdgeId
  labelId: string
  pointerId: number
  path: EdgePathResult
  textMode: Edge['textMode']
  labelSize?: Size
  draft?: EdgeLabelDragDraft
}

const readLabelText = (
  value: string | undefined
) => typeof value === 'string'
  ? value
  : ''

const isSingleSelectedEdge = (
  ctx: InteractionContext,
  edgeId: EdgeId
) => {
  const target = ctx.selection.get().summary.target

  return (
    target.nodeIds.length === 0
    && target.edgeIds.length === 1
    && target.edgeIds[0] === edgeId
  )
}

const readEdgeLabelPatch = (
  edge: Edge,
  labelId: string,
  draft: EdgeLabelDragDraft
) => {
  let changed = false
  const nextLabels = edge.labels?.map((label) => {
    if (label.id !== labelId) {
      return label
    }

    const nextLabel = {
      ...label,
      t: draft.t,
      offset: draft.offset
    }

    changed = (
      nextLabel.t !== label.t
      || nextLabel.offset !== label.offset
    )

    return changed
      ? nextLabel
      : label
  })

  return changed && nextLabels
    ? {
        labels: nextLabels
      }
    : undefined
}

const createEdgeLabelDragSession = (
  ctx: InteractionContext,
  initial: EdgeLabelDragState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    pointerWorld: Point
  ) => {
    const projected = projectPointToEdgeLabelPlacement({
      path: state.path,
      point: pointerWorld,
      maxOffset: EDGE_LABEL_RAIL_OFFSET,
      centerTolerance: EDGE_LABEL_CENTER_TOLERANCE,
      textMode: state.textMode,
      labelSize: state.labelSize,
      sideGap: readEdgeLabelSideGap(state.textMode ?? 'horizontal')
    })
    if (!projected) {
      return
    }

    const draft = {
      t: projected.t,
      offset: projected.offset
    }

    state = {
      ...state,
      draft
    }

    const patch = readEdgeLabelPatch(
      state.edge,
      state.labelId,
      draft
    )
    interaction!.gesture = patch
      ? createEdgeGesture(
          'edge-label',
          {
            patches: [{
              id: state.edgeId,
              patch
            }]
          }
        )
      : null
  }

  interaction = {
    mode: 'edge-label',
    pointerId: state.pointerId,
    chrome: false,
    gesture: null,
    autoPan: {
      frame: (pointer) => {
        step(ctx.query.viewport.pointer(pointer).world)
      }
    },
    move: (input) => {
      step(input.world)
    },
    up: (input) => {
      step(input.world)

      if (state.draft) {
        ctx.command.edge.label.patch(
          state.edgeId,
          state.labelId,
          state.draft
        )
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

const createEdgeLabelDragState = (
  ctx: InteractionContext,
  input: {
    edgeId: EdgeId
    labelId: string
    pointerId: number
  }
): EdgeLabelDragState | null => {
  const item = ctx.query.edge.item.get(input.edgeId)
  const view = ctx.query.edge.resolved.get(input.edgeId)
  const label = item?.edge.labels?.find((entry) => entry.id === input.labelId)
  if (!item || !view || !label) {
    return null
  }

  const text = readLabelText(label.text)
  const fontSize = label.style?.size ?? 14
  const measuredSize = ctx.layout.measureText({
    sourceId: readEdgeLabelTextSourceId(input.edgeId, input.labelId),
    text,
    placeholder: EDGE_LABEL_PLACEHOLDER,
    widthMode: 'auto',
    fontSize,
    fontWeight: label.style?.weight ?? 400,
    fontStyle: label.style?.italic
      ? 'italic'
      : 'normal'
  })

  return {
    edge: item.edge,
    edgeId: input.edgeId,
    labelId: input.labelId,
    pointerId: input.pointerId,
    path: view.path,
    textMode: item.edge.textMode,
    labelSize: resolveEdgeLabelPlacementSize({
      textMode: item.edge.textMode ?? 'horizontal',
      measuredSize,
      text,
      fontSize
    })
  }
}

const isDragStart = (
  start: PointerDownInput,
  input: PointerMoveInput
) => Math.hypot(
  input.client.x - start.client.x,
  input.client.y - start.client.y
) >= GestureTuning.dragMinDistance

export const createEdgeLabelPressSession = (
  ctx: InteractionContext,
  start: PointerDownInput,
  input: {
    edgeId: EdgeId
    labelId: string
  }
): InteractionSession => ({
  mode: 'press',
  pointerId: start.pointerId,
  chrome: true,
  move: (nextInput) => {
    if (!isDragStart(start, nextInput)) {
      return
    }

    const nextState = createEdgeLabelDragState(ctx, {
      edgeId: input.edgeId,
      labelId: input.labelId,
      pointerId: start.pointerId
    })
    if (!nextState) {
      return FINISH
    }

    const next = createEdgeLabelDragSession(
      ctx,
      nextState
    )
    next.move?.(nextInput)
    return replaceSession(next)
  },
  up: (nextInput) => {
    ctx.local.session.selection.replace({
      edgeIds: [input.edgeId]
    })
    ctx.local.edit.startEdgeLabel(input.edgeId, input.labelId, {
      caret: {
        kind: 'point',
        client: nextInput.client
      }
    })
    return FINISH
  },
  cleanup: () => {}
})

export const startEdgeLabelPress = (
  ctx: InteractionContext,
  pointer: PointerDownInput
): {
  edgeId: EdgeId
  labelId: string
} | 'handled' | undefined => {
  if (
    pointer.button !== 0
    || pointer.editable
    || pointer.pick.kind !== 'edge'
    || pointer.pick.part !== 'label'
    || !pointer.pick.labelId
  ) {
    return undefined
  }

  if (!isSingleSelectedEdge(ctx, pointer.pick.id)) {
    ctx.local.session.selection.replace({
      edgeIds: [pointer.pick.id]
    })
    return 'handled'
  }

  return {
    edgeId: pointer.pick.id,
    labelId: pointer.pick.labelId
  }
}
