import { createId } from '@whiteboard/core/id'
import type { Edge, EdgeId, EdgePatch } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@engine-types/result'
import type { EdgeApi } from '../../types/commands'
import type {
  EditorRead,
  EditorStore
} from '../../types/editor'
import type { SessionCommands } from './session'

export type EdgeCommands = {
  create: EdgeApi['create']
  patch: EdgeApi['patch']
  move: EdgeApi['move']
  reconnect: EdgeApi['reconnect']
  update: (id: EdgeId, patch: EdgePatch) => CommandResult
  updateMany: (
    updates: readonly {
      id: EdgeId
      patch: EdgePatch
    }[]
  ) => CommandResult
  delete: (ids: EdgeId[]) => CommandResult
  route: EdgeApi['route']
  label: EdgeApi['labels']
}

const DEFAULT_EDGE_LABEL = {
  t: 0.5,
  offset: 0
} as const

const hasEdgePatchContent = (
  patch: EdgePatch
) => Object.keys(patch).length > 0

const readEdge = (
  read: EditorRead,
  edgeId: EdgeId
) => read.edge.item.get(edgeId)?.edge

const mergeEdgeLabelPatch = (
  edge: Edge,
  labelId: string,
  patch: Parameters<EdgeApi['labels']['patch']>[2]
) => {
  const labels = edge.labels ?? []
  let changed = false

  const nextLabels = labels.map((label) => {
    if (label.id !== labelId) {
      return label
    }

    changed = true

    return {
      ...label,
      ...(patch.text !== undefined ? { text: patch.text } : {}),
      ...(patch.t !== undefined ? { t: patch.t } : {}),
      ...(patch.offset !== undefined ? { offset: patch.offset } : {}),
      ...(patch.style
        ? {
            style: {
              ...(label.style ?? {}),
              ...patch.style
            }
          }
        : {})
    }
  })

  return changed
    ? nextLabels
    : undefined
}

export const createEdgeCommands = ({
  engine,
  read,
  edit,
  session
}: {
  engine: Engine
  read: EditorRead
  edit: EditorStore['edit']
  session: Pick<SessionCommands, 'edit' | 'selection'>
}): EdgeCommands => ({
  create: (payload) => engine.execute({
    type: 'edge.create',
    payload
  }),
  patch: (edgeIds, patch) => {
    if (!hasEdgePatchContent(patch)) {
      return undefined
    }

    const updates = edgeIds.flatMap((id) => engine.read.edge.item.get(id)
      ? [{
          id,
          patch
        }]
      : [])
    if (!updates.length) {
      return undefined
    }

    return engine.execute({
      type: 'edge.patch',
      updates
    })
  },
  move: (edgeId, delta) => engine.execute({
    type: 'edge.move',
    edgeId,
    delta
  }),
  reconnect: (edgeId, end, target) => engine.execute({
    type: 'edge.reconnect',
    edgeId,
    end,
    target
  }),
  update: (id, patch) => engine.execute({
    type: 'edge.patch',
    updates: [{
      id,
      patch
    }]
  }),
  updateMany: (updates) => engine.execute({
    type: 'edge.patch',
    updates
  }),
  delete: (ids) => engine.execute({
    type: 'edge.delete',
    ids
  }),
  route: {
    insert: (edgeId, point) => engine.execute({
      type: 'edge.route.insert',
      edgeId,
      point
    }),
    move: (edgeId, index, point) => engine.execute({
      type: 'edge.route.move',
      edgeId,
      index,
      point
    }),
    remove: (edgeId, index) => engine.execute({
      type: 'edge.route.remove',
      edgeId,
      index
    }),
    clear: (edgeId) => engine.execute({
      type: 'edge.route.clear',
      edgeId
    })
  },
  label: {
    add: (edgeId) => {
      const currentEdge = readEdge(read, edgeId)
      if (!currentEdge) {
        return undefined
      }

      const currentEdit = edit.get()
      if (
        currentEdit
        && currentEdit.kind === 'edge-label'
        && currentEdit.edgeId === edgeId
      ) {
        return undefined
      }

      const labelId = createId('edge_label')
      const nextLabels = [
        ...(currentEdge.labels ?? []),
        {
          id: labelId,
          ...DEFAULT_EDGE_LABEL
        }
      ]

      engine.execute({
        type: 'edge.patch',
        updates: [{
          id: edgeId,
          patch: {
            labels: nextLabels
          }
        }]
      })
      session.selection.replace({
        edgeIds: [edgeId]
      })
      session.edit.startEdgeLabel(edgeId, labelId)
      return labelId
    },
    patch: (edgeId, labelId, patch) => {
      const currentEdge = readEdge(read, edgeId)
      if (!currentEdge) {
        return undefined
      }

      const nextLabels = mergeEdgeLabelPatch(currentEdge, labelId, patch)
      if (!nextLabels) {
        return undefined
      }

      return engine.execute({
        type: 'edge.patch',
        updates: [{
          id: edgeId,
          patch: {
            labels: nextLabels
          }
        }]
      })
    },
    remove: (edgeId, labelId) => {
      const currentEdge = readEdge(read, edgeId)
      if (!currentEdge?.labels?.some((label) => label.id === labelId)) {
        return undefined
      }

      const nextLabels = currentEdge.labels.filter((label) => label.id !== labelId)
      const currentEdit = edit.get()
      if (
        currentEdit
        && currentEdit.kind === 'edge-label'
        && currentEdit.edgeId === edgeId
        && currentEdit.labelId === labelId
      ) {
        session.edit.clear()
      }

      return engine.execute({
        type: 'edge.patch',
        updates: [{
          id: edgeId,
          patch: {
            labels: nextLabels.length > 0 ? nextLabels : []
          }
        }]
      })
    }
  }
})
