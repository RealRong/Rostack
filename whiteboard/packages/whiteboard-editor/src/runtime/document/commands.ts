import { isNodeUpdateEmpty } from '@whiteboard/core/node'
import type { EdgePatch } from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { DocumentRuntime } from './types'
import type { NodeMutations } from '../node/mutations'
import type { NodePatchWriter } from '../node/types'

const hasEdgePatchContent = (
  patch: EdgePatch
) => Object.keys(patch).length > 0

export const createDocumentCommands = (
  engine: Engine
): Pick<
  DocumentRuntime,
  'replace' | 'insert' | 'delete' | 'duplicate' | 'order' | 'background' | 'history'
> => ({
  replace: (document) => engine.execute({
    type: 'document.replace',
    document
  }),
  insert: (slice, options) => engine.execute({
    type: 'document.insert',
    slice,
    options
  }),
  delete: (refs) => engine.execute({
    type: 'document.delete',
    refs
  }),
  duplicate: (refs) => engine.execute({
    type: 'document.duplicate',
    refs
  }),
  order: (refs, mode) => engine.execute({
    type: 'document.order',
    refs,
    mode
  }),
  background: {
    set: (background) => engine.execute({
      type: 'document.background.set',
      background
    })
  },
  history: {
    get: engine.history.get,
    undo: engine.history.undo,
    redo: engine.history.redo,
    clear: engine.history.clear
  }
})

export const createGroupCommands = (
  engine: Engine
): DocumentRuntime['group'] => ({
  merge: (target) => engine.execute({
    type: 'group.merge',
    target
  }),
  order: {
    set: (ids) => engine.execute({
      type: 'group.order',
      mode: 'set',
      ids
    }),
    bringToFront: (ids) => engine.execute({
      type: 'group.order',
      mode: 'front',
      ids
    }),
    sendToBack: (ids) => engine.execute({
      type: 'group.order',
      mode: 'back',
      ids
    }),
    bringForward: (ids) => engine.execute({
      type: 'group.order',
      mode: 'forward',
      ids
    }),
    sendBackward: (ids) => engine.execute({
      type: 'group.order',
      mode: 'backward',
      ids
    })
  },
  ungroup: (id) => engine.execute({
    type: 'group.ungroup',
    id
  }),
  ungroupMany: (ids) => engine.execute({
    type: 'group.ungroupMany',
    ids
  })
})

export const createNodeCommands = ({
  engine,
  patch,
  mutations,
  text
}: {
  engine: Engine
  patch: NodePatchWriter
  mutations: NodeMutations
  text: DocumentRuntime['node']['text']
}): DocumentRuntime['node'] => ({
  create: (payload) => engine.execute({
    type: 'node.create',
    payload
  }),
  patch: (ids, update, options) => {
    if (isNodeUpdateEmpty(update)) {
      return undefined
    }

    const updates = ids.flatMap((id) => engine.read.node.item.get(id)
      ? [{
          id,
          update
        }]
      : [])
    if (!updates.length) {
      return undefined
    }

    return patch.updateMany(updates, {
      origin: options?.origin
    })
  },
  move: (input) => engine.execute({
    type: 'node.move',
    ids: input.ids,
    delta: input.delta
  }),
  align: (ids, mode) => engine.execute({
    type: 'node.align',
    ids,
    mode
  }),
  distribute: (ids, mode) => engine.execute({
    type: 'node.distribute',
    ids,
    mode
  }),
  delete: (ids) => engine.execute({
    type: 'node.delete',
    ids
  }),
  deleteCascade: (ids) => engine.execute({
    type: 'node.deleteCascade',
    ids
  }),
  duplicate: (ids) => engine.execute({
    type: 'node.duplicate',
    ids
  }),
  update: patch.update,
  updateMany: patch.updateMany,
  lock: mutations.lock,
  shape: mutations.shape,
  appearance: mutations.appearance,
  text
})

export const createEdgeCommands = (
  engine: Engine
): DocumentRuntime['edge'] => ({
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
