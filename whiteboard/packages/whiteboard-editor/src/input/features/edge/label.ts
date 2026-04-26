import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  Edge,
  EdgeId,
  Point,
  Size
} from '@whiteboard/core/types'
import type { EdgePathResult } from '@whiteboard/core/types/edge'
import { createGesture } from '@whiteboard/editor/input/core/gesture'
import {
  FINISH
} from '@whiteboard/editor/input/session/result'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import type {
  PointerDownInput
} from '@whiteboard/editor/types/input'
import { createPressDragSession } from '@whiteboard/editor/input/session/press'
import {
  replaceSelection,
  startEdgeLabelEdit
} from '@whiteboard/editor/input/helpers'
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'
import {
  readEdgeCapability,
  readEdgeModel
} from '@whiteboard/editor/edge/read'

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

const isSingleSelectedEdge = (
  ctx: Pick<EditorHostDeps, 'sessionSource'>,
  edgeId: EdgeId
) => {
  const target = ctx.sessionSource.selection.summary.get().target

  return (
    target.nodeIds.length === 0
    && target.edgeIds.length === 1
    && target.edgeIds[0] === edgeId
  )
}

const canEditEdgeLabel = (
  projection: Pick<EditorHostDeps, 'projection'>['projection'],
  edgeId: EdgeId
) => readEdgeCapability(projection.query, edgeId)?.editLabel ?? false

const readEdgeLabelMetrics = (
  projection: Pick<EditorHostDeps, 'projection'>['projection'],
  ref: {
    edgeId: EdgeId
    labelId: string
  }
) => projection.query.edge.get(ref.edgeId)?.route.labels
  .find((entry) => entry.labelId === ref.labelId)?.size

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
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'write'>,
  initial: EdgeLabelDragState
): InteractionSession => {
  let state = initial
  let interaction = null as InteractionSession | null

  const step = (
    pointerWorld: Point
  ) => {
    const projected = edgeApi.label.projectPoint({
      path: state.path,
      point: pointerWorld,
      maxOffset: edgeApi.label.railOffset,
      centerTolerance: edgeApi.label.centerTolerance,
      textMode: state.textMode,
      labelSize: state.labelSize,
      sideGap: edgeApi.label.sideGap(state.textMode ?? 'horizontal')
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
      ? createGesture(
          'edge-label',
          {
            edgePatches: [{
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
        step(ctx.sessionRead.viewport.pointer(pointer).world)
      }
    },
    move: (input) => {
      step(input.world)
    },
    up: (input) => {
      step(input.world)

      if (state.draft) {
        ctx.write.edge.label.update(
          state.edgeId,
          state.labelId,
          {
            fields: state.draft
          }
        )
      }

      return FINISH
    },
    cleanup: () => {}
  }

  return interaction
}

const createEdgeLabelDragState = (
  ctx: Pick<EditorHostDeps, 'projection'>,
  input: {
    edgeId: EdgeId
    labelId: string
    pointerId: number
  }
): EdgeLabelDragState | null => {
  const edge = readEdgeModel(ctx.projection.query, input.edgeId)
  const view = ctx.projection.query.edge.get(input.edgeId)
  const ref = {
    edgeId: input.edgeId,
    labelId: input.labelId
  } as const
  if (
    !edge
    || !view
    || !view.route.svgPath
    || !canEditEdgeLabel(ctx.projection, input.edgeId)
  ) {
    return null
  }

  const labelSize = readEdgeLabelMetrics(ctx.projection, ref)
  if (!labelSize) {
    return null
  }

  return {
    edge,
    edgeId: input.edgeId,
    labelId: input.labelId,
    pointerId: input.pointerId,
    path: {
      points: [...view.route.points],
      segments: [...view.route.segments],
      svgPath: view.route.svgPath
    },
    textMode: edge.textMode,
    labelSize
  }
}

export const createEdgeLabelPressSession = (
  ctx: Pick<EditorHostDeps, 'projection' | 'sessionRead' | 'write' | 'session' | 'document'>,
  start: PointerDownInput,
  input: {
    edgeId: EdgeId
    labelId: string
  }
): InteractionSession => createPressDragSession({
  start,
  chrome: true,
  createDragSession: () => {
    const nextState = createEdgeLabelDragState(ctx, {
      edgeId: input.edgeId,
      labelId: input.labelId,
      pointerId: start.pointerId
    })
    if (!nextState) {
      return null
    }

    return createEdgeLabelDragSession(
      ctx,
      nextState
    )
  },
  onTap: (nextInput) => {
    replaceSelection({
      session: ctx.session
    }, {
      edgeIds: [input.edgeId]
    })
    startEdgeLabelEdit({
      session: ctx.session,
      document: ctx.document
    }, input.edgeId, input.labelId, {
      caret: {
        kind: 'point',
        client: nextInput.client
      }
    })
  }
})

export const startEdgeLabelPress = (
  ctx: Pick<EditorHostDeps, 'projection' | 'session' | 'sessionSource'>,
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
    replaceSelection({
      session: ctx.session
    }, {
      edgeIds: [pointer.pick.id]
    })
    return 'handled'
  }

  const edge = readEdgeModel(ctx.projection.query, pointer.pick.id)
  if (!edge || !canEditEdgeLabel(ctx.projection, pointer.pick.id)) {
    return 'handled'
  }

  return {
    edgeId: pointer.pick.id,
    labelId: pointer.pick.labelId
  }
}
