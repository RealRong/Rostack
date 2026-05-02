import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  EdgePatch,
  EdgeRouteInput,
  Point
} from '@whiteboard/core/types'
import type { EdgeActions } from '@whiteboard/editor/action/types'
import type { EditorScene } from '@whiteboard/editor-scene'
import type {
  EditorCommand,
  EditorDispatchInput
} from '@whiteboard/editor/state-engine/intents'
import type { EditSession } from '@whiteboard/editor/session/edit'
import type { DocumentFrame } from '@whiteboard/editor-scene'
import type { EditorWrite } from '@whiteboard/editor/write'

const readEdgeOrThrow = (
  graph: EditorScene,
  edgeId: string
) => {
  const edge = graph.edges.get(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  return edge
}

const writeRouteFromPoint = (input: {
  graph: EditorScene
  write: Pick<EditorWrite, 'edge'>
  edgeId: string
  resolve: (edge: ReturnType<typeof readEdgeOrThrow>) => { route?: EdgeRouteInput } | undefined
}) => {
  const patch = input.resolve(
    readEdgeOrThrow(input.graph, input.edgeId)
  )
  if (!patch) {
    throw new Error(`Edge route point ${input.edgeId} not found.`)
  }

  return input.write.edge.route.set(
    input.edgeId,
    patch.route ?? {
      kind: 'auto'
    }
  )
}

const createStartEdgeLabelCommand = (input: {
  document: Pick<DocumentFrame, 'edge'>
  edgeId: string
  labelId: string
}): EditorCommand | null => {
  const edge = input.document.edge(input.edgeId)
  const label = edge?.labels?.find((entry) => entry.id === input.labelId)
  if (!edge || !label) {
    return null
  }

  return {
    type: 'edit.set',
    edit: {
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
}

export const createEdgeActions = (input: {
  graph: EditorScene
  document: Pick<DocumentFrame, 'edge'>
  editor: {
    edit: {
      get: () => EditSession
    }
    dispatch: (command: EditorDispatchInput) => void
  }
  write: Pick<EditorWrite, 'edge'>
  edit: {
    clearEditingEdgeLabel: (input: {
      edgeId: string
      labelId: string
    }) => void
  }
}): EdgeActions => ({
  create: (value) => input.write.edge.create(value),
  patch: (edgeIds, patch) => {
    const update = edgeApi.update.fromPatch(patch)
    if (!update.fields && !update.record) {
      return undefined
    }

    return input.write.edge.updateMany(
      edgeIds.flatMap((id) => input.document.edge(id)
        ? [{
            id,
            input: update
          }]
        : [])
    )
  },
  move: (value) => input.write.edge.move(value),
  reconnectCommit: (value) => input.write.edge.reconnectCommit(value),
  delete: (ids) => input.write.edge.delete(ids),
  route: {
    set: (edgeId, route) => input.write.edge.route.set(edgeId, route),
    insertPoint: (edgeId, index, point) => {
      const edge = readEdgeOrThrow(input.graph, edgeId)
      const inserted = edgeApi.route.insert(edge, index, point)
      if (!inserted.ok) {
        throw new Error(inserted.error.message)
      }

      return input.write.edge.route.set(edgeId, inserted.data.patch.route ?? {
        kind: 'auto'
      })
    },
    movePoint: (edgeId, index, point) => writeRouteFromPoint({
      graph: input.graph,
      write: input.write,
      edgeId,
      resolve: (edge) => edgeApi.route.move(edge, index, point)
    }),
    removePoint: (edgeId, index) => writeRouteFromPoint({
      graph: input.graph,
      write: input.write,
      edgeId,
      resolve: (edge) => edgeApi.route.remove(edge, index)
    }),
    clear: (edgeId) => input.write.edge.route.clear(edgeId)
  },
  label: {
    add: (edgeId) => {
      const currentEdit = input.editor.edit.get()
      if (
        currentEdit
        && currentEdit.kind === 'edge-label'
        && currentEdit.edgeId === edgeId
      ) {
        return undefined
      }

      const inserted = input.write.edge.label.insert(edgeId)
      if (!inserted.ok) {
        return undefined
      }

      const editCommand = createStartEdgeLabelCommand({
        document: input.document,
        edgeId,
        labelId: inserted.data.labelId
      })
      if (editCommand) {
        input.editor.dispatch([
          {
            type: 'selection.set',
            selection: {
              nodeIds: [],
              edgeIds: [edgeId]
            }
          },
          editCommand
        ])
      } else {
        input.editor.dispatch({
          type: 'selection.set',
          selection: {
            nodeIds: [],
            edgeIds: [edgeId]
          }
        } satisfies EditorCommand)
      }
      return inserted.data.labelId
    },
    patch: (edgeId, labelId, patch) => input.write.edge.label.update(
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
      input.edit.clearEditingEdgeLabel({
        edgeId,
        labelId
      })
      return input.write.edge.label.delete(edgeId, labelId)
    }
  },
  style: {
    color: (edgeIds, value) => input.write.edge.style.color(edgeIds, value),
    opacity: (edgeIds, value) => input.write.edge.style.opacity(edgeIds, value),
    width: (edgeIds, value) => input.write.edge.style.width(edgeIds, value),
    dash: (edgeIds, value) => input.write.edge.style.dash(edgeIds, value),
    start: (edgeIds, value) => input.write.edge.style.start(edgeIds, value),
    end: (edgeIds, value) => input.write.edge.style.end(edgeIds, value),
    swapMarkers: (edgeIds) => input.write.edge.style.swapMarkers(edgeIds)
  },
  type: {
    set: (edgeIds, value) => input.write.edge.type.set(edgeIds, value)
  },
  lock: {
    set: (edgeIds, locked) => input.write.edge.lock.set(edgeIds, locked),
    toggle: (edgeIds) => input.write.edge.lock.toggle(edgeIds)
  },
  textMode: {
    set: (edgeIds, value) => input.write.edge.textMode.set(edgeIds, value)
  }
})
