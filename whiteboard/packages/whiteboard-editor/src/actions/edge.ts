import { edge as edgeApi } from '@whiteboard/core/edge'
import { entityTable } from '@shared/core'
import type {
  EdgePatch,
  Point
} from '@whiteboard/core/types'
import type { EditorActionContext } from '@whiteboard/editor/actions/context'
import type { EdgeActions } from '@whiteboard/editor/actions/types'
import type { EditSession } from '@whiteboard/editor/schema/edit'
import type { EditController } from '@whiteboard/editor/actions/edit'

const readEdgeOrThrow = (
  context: EditorActionContext,
  edgeId: string
) => {
  const edge = context.projection.edges.get(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  return edge
}

const writeRouteFromPoint = (input: {
  context: EditorActionContext
  edgeId: string
  resolve: (edge: ReturnType<typeof readEdgeOrThrow>) => { points?: Point[] } | undefined
}) => {
  const patch = input.resolve(
    readEdgeOrThrow(input.context, input.edgeId)
  )
  if (!patch) {
    throw new Error(`Edge route point ${input.edgeId} not found.`)
  }

  return input.context.write.edge.points.set(
    input.edgeId,
    patch.points
  )
}

const createStartEdgeLabelSession = (input: {
  context: EditorActionContext
  edgeId: string
  labelId: string
}): EditSession => {
  const edge = input.context.document.edge(input.edgeId)
  const label = edge
    ? entityTable.read.list(edge.labels ?? {
        ids: [],
        byId: {}
      }).find((entry) => entry.id === input.labelId)
    : undefined
  if (!edge || !label) {
    return null
  }

  return {
    kind: 'edge-label',
    edgeId: input.edgeId,
    labelId: input.labelId,
    text: typeof label.text === 'string' ? label.text : '',
    composing: false,
    caret: {
      kind: 'end'
    }
  }
}

const setEdgeLabelSelection = (input: {
  context: EditorActionContext
  edgeId: string
  edit: EditSession
}) => {
  input.context.state.write(({
    writer
  }) => {
    writer.selection.set({
      nodeIds: [],
      edgeIds: [input.edgeId]
    })
    if (input.edit) {
      writer.edit.set(input.edit)
    }
  })
}

export const createEdgeActions = (
  context: EditorActionContext,
  edit: EditController
): EdgeActions => ({
  create: (value) => context.write.edge.create(value),
  patch: (edgeIds, patch) => {
    const update = edgeApi.update.fromPatch(patch)
    if (!update.fields && !update.record) {
      return undefined
    }

    return context.write.edge.updateMany(
      edgeIds.flatMap((id) => context.document.edge(id)
        ? [{
            id,
            input: update
          }]
        : [])
    )
  },
  move: (value) => context.write.edge.move(value),
  reconnectCommit: (value) => context.write.edge.reconnectCommit(value),
  delete: (ids) => context.write.edge.delete(ids),
  points: {
    set: (edgeId, points) => context.write.edge.points.set(edgeId, points),
    insertPoint: (edgeId, index, point) => {
      const edge = readEdgeOrThrow(context, edgeId)
      const inserted = edgeApi.points.insert(edge, index, point)
      if (!inserted.ok) {
        throw new Error(inserted.error.message)
      }

      return context.write.edge.points.set(edgeId, inserted.data.patch.points)
    },
    movePoint: (edgeId, index, point) => writeRouteFromPoint({
      context,
      edgeId,
      resolve: (edge) => edgeApi.points.move(edge, index, point)
    }),
    removePoint: (edgeId, index) => writeRouteFromPoint({
      context,
      edgeId,
      resolve: (edge) => edgeApi.points.remove(edge, index)
    }),
    clear: (edgeId) => context.write.edge.points.clear(edgeId)
  },
  label: {
    add: (edgeId) => {
      const currentEdit = context.stores.edit.get()
      if (
        currentEdit
        && currentEdit.kind === 'edge-label'
        && currentEdit.edgeId === edgeId
      ) {
        return undefined
      }

      const inserted = context.write.edge.label.insert(edgeId)
      if (!inserted.ok) {
        return undefined
      }

      const nextEdit = createStartEdgeLabelSession({
        context,
        edgeId,
        labelId: inserted.data.labelId
      })

      if (nextEdit) {
        setEdgeLabelSelection({
          context,
          edgeId,
          edit: nextEdit
        })
      }

      return inserted.data.labelId
    },
    patch: (edgeId, labelId, patch) => context.write.edge.label.update(
      edgeId,
      labelId,
      edgeApi.label.patch.fromPatch({
        ...(patch.text !== undefined ? { text: patch.text } : {}),
        ...(patch.t !== undefined ? { t: patch.t } : {}),
        ...(patch.offset !== undefined ? { offset: patch.offset } : {}),
        ...(patch.style ? { style: patch.style } : {}),
        ...(patch.data ? { data: patch.data } : {})
      })
    ),
    remove: (edgeId, labelId) => {
      edit.clearEditingEdgeLabel({
        edgeId,
        labelId
      })
      return context.write.edge.label.delete(edgeId, labelId)
    }
  },
  style: {
    color: (edgeIds, value) => context.write.edge.style.color(edgeIds, value),
    opacity: (edgeIds, value) => context.write.edge.style.opacity(edgeIds, value),
    width: (edgeIds, value) => context.write.edge.style.width(edgeIds, value),
    dash: (edgeIds, value) => context.write.edge.style.dash(edgeIds, value),
    start: (edgeIds, value) => context.write.edge.style.start(edgeIds, value),
    end: (edgeIds, value) => context.write.edge.style.end(edgeIds, value),
    swapMarkers: (edgeIds) => context.write.edge.style.swapMarkers(edgeIds)
  },
  type: {
    set: (edgeIds, value) => context.write.edge.type.set(edgeIds, value)
  },
  lock: {
    set: (edgeIds, locked) => context.write.edge.lock.set(edgeIds, locked),
    toggle: (edgeIds) => context.write.edge.lock.toggle(edgeIds)
  },
  textMode: {
    set: (edgeIds, value) => context.write.edge.textMode.set(edgeIds, value)
  }
})
