import type { Engine } from '@whiteboard/engine'
import type { EditorRead } from '../../types/editor'
import type { PreviewRuntime } from '../preview/types'
import type { SessionRuntime } from '../session/types'
import { createMindmapRuntime } from './mindmap'
import { createNodeAppearanceMutations } from '../node/appearance'
import { createNodePatchWriter } from '../node/patch'
import { createNodeLockMutations } from '../node/lock'
import { createNodeShapeMutations } from '../node/shape'
import { createNodeTextMutations } from '../node/text'
import type { DocumentRuntime } from './types'

export const createDocumentRuntime = ({
  engine,
  read,
  session,
  preview
}: {
  engine: Engine
  read: EditorRead
  session: Pick<SessionRuntime, 'edit' | 'selection'>
  preview: Pick<PreviewRuntime, 'node'>
}): DocumentRuntime => {
  const nodePatch = createNodePatchWriter(engine)
  const nodeAppearance = createNodeAppearanceMutations({
    engine,
    document: nodePatch
  })
  const nodeLock = createNodeLockMutations({
    engine,
    document: nodePatch
  })
  const nodeShape = createNodeShapeMutations({
    engine,
    document: nodePatch
  })
  const nodeText = createNodeTextMutations({
    read,
    committedNode: engine.read.node.item,
    preview,
    session,
    deleteCascade: (ids) => engine.execute({
      type: 'node.deleteCascade',
      ids
    }),
    document: nodePatch,
    appearance: nodeAppearance
  })

  const node = {
    create: (payload) => engine.execute({
      type: 'node.create',
      payload
    }),
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
    update: nodePatch.update,
    updateMany: nodePatch.updateMany,
    lock: nodeLock,
    shape: nodeShape,
    appearance: nodeAppearance,
    text: {
      commit: nodeText.commit,
      setColor: nodeText.setColor,
      setSize: nodeText.setSize,
      setWeight: nodeText.setWeight,
      setItalic: nodeText.setItalic,
      setAlign: nodeText.setAlign
    }
  } satisfies DocumentRuntime['node']

  const mindmap = createMindmapRuntime({
    engine,
    runtimeHost: {
      read,
      document: {
        mindmap: {
          create: (payload) => engine.execute({
            type: 'mindmap.create',
            payload
          }),
          delete: (ids) => engine.execute({
            type: 'mindmap.delete',
            ids
          }),
          insert: (id, input) => engine.execute({
            type: 'mindmap.insert',
            id,
            input
          }),
          moveSubtree: (id, input) => engine.execute({
            type: 'mindmap.move',
            id,
            input
          }),
          removeSubtree: (id, input) => engine.execute({
            type: 'mindmap.remove',
            id,
            input
          }),
          cloneSubtree: (id, input) => engine.execute({
            type: 'mindmap.clone',
            id,
            input
          }),
          updateNode: (id, input) => engine.execute({
            type: 'mindmap.patchNode',
            id,
            input
          })
        },
        node: {
          update: nodePatch.update
        }
      }
    }
  })

  return {
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
    },
    group: {
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
    },
    edge: {
      create: (payload) => engine.execute({
        type: 'edge.create',
        payload
      }),
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
    },
    node,
    mindmap
  }
}
