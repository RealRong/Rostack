import { edge as edgeApi } from '@whiteboard/core/edge'
import type {
  EdgePatch,
  EdgeRouteInput,
  Point
} from '@whiteboard/core/types'
import type { EdgeActions } from '@whiteboard/editor/action/types'
import type { EditController } from '@whiteboard/editor/action/edit'
import type { EditorSceneApi } from '@whiteboard/editor/scene/api'
import type {
  EditorSession,
  EditorSessionSelectionCommands
} from '@whiteboard/editor/session/runtime'
import type { DocumentQuery } from '@whiteboard/editor-scene'
import type { EditorWrite } from '@whiteboard/editor/write'

const toEdgeUpdateInput = (
  patch: EdgePatch
) => {
  const fields = {
    ...(patch.source ? { source: patch.source } : {}),
    ...(patch.target ? { target: patch.target } : {}),
    ...(patch.type ? { type: patch.type } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'locked') ? { locked: patch.locked } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'groupId') ? { groupId: patch.groupId } : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'textMode') ? { textMode: patch.textMode } : {})
  }
  const record = {
    ...(Object.prototype.hasOwnProperty.call(patch, 'data')
      ? {
          data: patch.data
        }
      : {}),
    ...(Object.prototype.hasOwnProperty.call(patch, 'style')
      ? {
          style: patch.style
        }
      : {})
  }

  return {
    ...(Object.keys(fields).length > 0 ? { fields } : {}),
    ...(Object.keys(record).length > 0 ? { record } : {})
  }
}

const toEdgeLabelUpdateInput = (
  patch: Parameters<EdgeActions['label']['patch']>[2]
) => ({
  fields: {
    ...(patch.text !== undefined ? { text: patch.text } : {}),
    ...(patch.t !== undefined ? { t: patch.t } : {}),
    ...(patch.offset !== undefined ? { offset: patch.offset } : {})
  },
  ...(patch.style || patch.data
    ? {
        record: {
          ...(patch.style ? { style: patch.style } : {}),
          ...(patch.data ? { data: patch.data } : {})
        }
      }
    : {})
})

const readEdgeOrThrow = (
  graph: Pick<EditorSceneApi, 'query'>,
  edgeId: string
) => {
  const edge = graph.query.edge.get(edgeId)?.base.edge
  if (!edge) {
    throw new Error(`Edge ${edgeId} not found.`)
  }

  return edge
}

const writeRouteFromPoint = (input: {
  graph: Pick<EditorSceneApi, 'query'>
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

export const createEdgeActions = (input: {
  graph: Pick<EditorSceneApi, 'query'>
  document: Pick<DocumentQuery, 'edge'>
  session: Pick<EditorSession, 'state'> & {
    commands: {
      selection: Pick<EditorSessionSelectionCommands, 'replace'>
    }
  }
  write: Pick<EditorWrite, 'edge'>
  edit: Pick<EditController, 'startEdgeLabel' | 'clearEditingEdgeLabel'>
}): EdgeActions => ({
  create: (value) => input.write.edge.create(value),
  patch: (edgeIds, patch) => {
    const update = toEdgeUpdateInput(patch)
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
      const currentEdit = input.session.state.edit.get()
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

      input.session.commands.selection.replace({
        edgeIds: [edgeId]
      })
      input.edit.startEdgeLabel({
        edgeId,
        labelId: inserted.data.labelId
      })
      return inserted.data.labelId
    },
    patch: (edgeId, labelId, patch) => input.write.edge.label.update(
      edgeId,
      labelId,
      toEdgeLabelUpdateInput(patch)
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
