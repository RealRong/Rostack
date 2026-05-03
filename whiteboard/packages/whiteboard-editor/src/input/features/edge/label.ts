import { edge as edgeApi } from '@whiteboard/core/edge'
import { selection as selectionApi } from '@whiteboard/core/selection'
import type {
  Edge,
  EdgeId,
  Point,
  Size
} from '@whiteboard/core/types'
import type { EdgePathResult } from '@whiteboard/core/types/edge'
import {
  FINISH
} from '@whiteboard/editor/input/internals/result'
import type { InteractionSession } from '@whiteboard/editor/input/core/types'
import type {
  PointerDownInput
} from '@whiteboard/editor/api/input'
import { createPressDragSession } from '@whiteboard/editor/input/internals/press'
import type { Editor } from '@whiteboard/editor/api/editor'
import type { EditSession } from '@whiteboard/editor/schema/edit'

const startEdgeLabelEdit = (input: {
  editor: Editor
  edgeId: EdgeId
  labelId: string
  caret: {
    kind: 'point'
    client: {
      x: number
      y: number
    }
  }
}): EditSession => {
  const edge = input.editor.document.edge(input.edgeId)
  const label = edge?.labels?.find((entry) => entry.id === input.labelId)
  if (!edge || !label) {
    return null
  }

  return {
    kind: 'edge-label',
    edgeId: input.edgeId,
    labelId: input.labelId,
    text: typeof label.text === 'string' ? label.text : '',
    composing: false,
    caret: input.caret
  }
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
  editor: Editor,
  edgeId: EdgeId
) => selectionApi.members.singleEdge(
  editor.scene.ui.selection.summary.get().target
) === edgeId

const canEditEdgeLabel = (
  projection: Editor['scene'],
  edgeId: EdgeId
) => projection.edges.capability(edgeId)?.editLabel ?? false

const readEdgeLabelMetrics = (
  projection: Editor['scene'],
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
  editor: Editor,
  initial: EdgeLabelDragState
): InteractionSession => {
  let state = initial

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
    editor.state.write(({
      writer,
      snapshot
    }) => {
      Object.keys(snapshot.preview.edge).forEach((edgeId) => {
        const id = edgeId as EdgeId
        if (!patch || id !== state.edgeId) {
          writer.preview.edge.delete(id)
          return
        }

        writer.preview.edge.patch(id, {
          patch,
          activeRouteIndex: undefined
        })
      })

      if (patch && !snapshot.preview.edge[state.edgeId]) {
        writer.preview.edge.create({
          id: state.edgeId,
          patch
        })
      }
    })
  }

  return {
    mode: 'edge-label',
    pointerId: state.pointerId,
    chrome: false,
    autoPan: {
      frame: (pointer) => {
        step(editor.viewport.pointer(pointer).world)
      }
    },
    move: (input) => {
      step(input.world)
    },
    up: (input) => {
      step(input.world)

      if (state.draft) {
        editor.actions.document.edge.label.patch(
          state.edgeId,
          state.labelId,
          state.draft
        )
      }

      return FINISH
    },
    cleanup: () => {
      editor.state.write(({
        writer,
        snapshot
      }) => {
        Object.keys(snapshot.preview.edge).forEach((edgeId) => {
          writer.preview.edge.delete(edgeId as EdgeId)
        })
      })
    }
  }
}

const createEdgeLabelDragState = (
  editor: Editor,
  input: {
    edgeId: EdgeId
    labelId: string
    pointerId: number
  }
): EdgeLabelDragState | null => {
  const edge = editor.scene.edges.get(input.edgeId)?.base.edge
  const view = editor.scene.edges.get(input.edgeId)
  if (
    !edge
    || !view
    || !view.route.svgPath
    || !canEditEdgeLabel(editor.scene, input.edgeId)
  ) {
    return null
  }

  const labelSize = readEdgeLabelMetrics(editor.scene, {
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
  editor: Editor,
  start: PointerDownInput,
  input: {
    edgeId: EdgeId
    labelId: string
  }
): InteractionSession => createPressDragSession({
  start,
  chrome: true,
  createDragSession: () => {
    const nextState = createEdgeLabelDragState(editor, {
      edgeId: input.edgeId,
      labelId: input.labelId,
      pointerId: start.pointerId
    })
    if (!nextState) {
      return null
    }

    return createEdgeLabelDragSession(
      editor,
      nextState
    )
  },
  onTap: (nextInput) => {
    const editCommand = startEdgeLabelEdit({
      editor,
      edgeId: input.edgeId,
      labelId: input.labelId,
      caret: {
        kind: 'point',
        client: nextInput.client
      }
    })
    if (!editCommand) {
      editor.actions.session.selection.replace({
        nodeIds: [],
        edgeIds: [input.edgeId]
      })
      return
    }

    editor.state.write(({
      writer
    }) => {
      writer.selection.set({
        nodeIds: [],
        edgeIds: [input.edgeId]
      })
      writer.edit.set(editCommand)
    })
  }
})

export const startEdgeLabelPress = (
  editor: Editor,
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

  if (!isSingleSelectedEdge(editor, pointer.pick.id)) {
    editor.actions.session.selection.replace({
      nodeIds: [],
      edgeIds: [pointer.pick.id]
    })
    return 'handled'
  }

  const edge = editor.scene.edges.get(pointer.pick.id)?.base.edge
  if (!edge || !canEditEdgeLabel(editor.scene, pointer.pick.id)) {
    return 'handled'
  }

  return {
    edgeId: pointer.pick.id,
    labelId: pointer.pick.labelId
  }
}
