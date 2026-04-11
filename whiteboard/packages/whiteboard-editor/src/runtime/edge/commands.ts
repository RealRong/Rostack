import type { EdgeId, EdgePatch } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { EditorEdgesApi } from '../../types/editor'
import type { CommandResult } from '@engine-types/result'

export type EdgeCommands = {
  create: EditorEdgesApi['create']
  patch: EditorEdgesApi['patch']
  move: EditorEdgesApi['move']
  reconnect: EditorEdgesApi['reconnect']
  update: (id: EdgeId, patch: EdgePatch) => CommandResult
  updateMany: (
    updates: readonly {
      id: EdgeId
      patch: EdgePatch
    }[]
  ) => CommandResult
  delete: (ids: EdgeId[]) => CommandResult
  route: EditorEdgesApi['route']
}

const hasEdgePatchContent = (
  patch: EdgePatch
) => Object.keys(patch).length > 0

export const createEdgeCommands = (
  engine: Engine
): EdgeCommands => ({
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
  }
})
