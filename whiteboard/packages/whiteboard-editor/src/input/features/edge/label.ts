import { edge as edgeApi } from '@whiteboard/core/edge'
import { selection as selectionApi } from '@whiteboard/core/selection'
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
import type { EditorHostDeps } from '@whiteboard/editor/input/runtime'

const startEdgeLabelEdit = (input: {
  ctx: Pick<EditorHostDeps, 'session' | 'document'>
  edgeId: EdgeId
  labelId: string
  caret: {
    kind: 'point'
    client: {
      x: number
      y: number
    }
  }
}) => {
  const edge = input.ctx.document.edge(input.edgeId)
  const label = edge?.labels?.find((entry) => entry.id === input.labelId)
  if (!edge || !label) {
    return
  }

  input.ctx.session.dispatch({
    type: 'edit.set',
    edit: {
      kind: 'edge-label',
      edgeId: input.edgeId,
      labelId: input.labelId,
      text: typeof label.text === 'string' ? label.text : '',
      composing: false,
      caret: input.caret
    }
  })
}

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
  ctx: Pick<EditorHostDeps, 'sceneDerived'>,
  edgeId: EdgeId
) => selectionApi.members.singleEdge(
  ctx.sceneDerived.selection.summary.get().target
) === edgeId

const canEditEdgeLabel = (
  projection: Pick<EditorHostDeps, 'projection'>['projection'],
  edgeId: EdgeId
) => projection.edges.capability(edgeId)?.editLabel ?? false

const readEdgeLabelMetrics = (
  projection: Pick<EditorHostDeps, 'projection'>['projection'],
  ref: {
    edgeId: EdgeId
    labelId: string
  }
) => projection.edges.get(ref.edgeId)?.route.labels
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
  let interaction: InteractionSession | undefined

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
    if (interaction) {
      interaction.gesture = patch
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
  const edge = ctx.projection.edges.get(input.edgeId)?.base.edge
  const view = ctx.projection.edges.get(input.edgeId)
  if (
    !edge
    || !view
    || !view.route.svgPath
    || !canEditEdgeLabel(ctx.projection, input.edgeId)
  ) {
    return null
  }

  const labelSize = readEdgeLabelMetrics(ctx.projection, {
    edgeId: input.edgeId,
    labelId: input.labelId
  })
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
    ctx.session.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: [],
        edgeIds: [input.edgeId]
      }
    })
    startEdgeLabelEdit({
      ctx,
      edgeId: input.edgeId,
      labelId: input.labelId,
      caret: {
        kind: 'point',
        client: nextInput.client
      }
    })
  }
})

export const startEdgeLabelPress = (
  ctx: Pick<EditorHostDeps, 'projection' | 'session' | 'sceneDerived'>,
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
    ctx.session.dispatch({
      type: 'selection.set',
      selection: {
        nodeIds: [],
        edgeIds: [pointer.pick.id]
      }
    })
    return 'handled'
  }

  const edge = ctx.projection.edges.get(pointer.pick.id)?.base.edge
  if (!edge || !canEditEdgeLabel(ctx.projection, pointer.pick.id)) {
    return 'handled'
  }

  return {
    edgeId: pointer.pick.id,
    labelId: pointer.pick.labelId
  }
}
