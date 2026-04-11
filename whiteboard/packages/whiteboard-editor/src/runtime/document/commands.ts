import type { Engine } from '@whiteboard/engine'
import type { DocumentCommands } from './types'

export const createDocumentCommands = (
  engine: Engine
): DocumentCommands => ({
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
  }
})
