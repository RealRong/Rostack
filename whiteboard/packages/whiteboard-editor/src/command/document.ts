import type {
  Slice,
  SliceInsertOptions,
  SliceInsertResult
} from '@whiteboard/core/document'
import type {
  CanvasItemRef,
  Document,
  EdgeId,
  GroupId,
  NodeId
} from '@whiteboard/core/types'
import type { Engine } from '@whiteboard/engine'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { OrderMode } from '@whiteboard/editor/types/commands'

export type DocumentCommands = {
  replace: (document: Document) => CommandResult
  insert: (
    slice: Slice,
    options?: SliceInsertOptions
  ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  delete: (refs: CanvasItemRef[]) => CommandResult
  duplicate: (refs: CanvasItemRef[]) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  order: (refs: CanvasItemRef[], mode: OrderMode) => CommandResult
  background: {
    set: (background?: Document['background']) => CommandResult
  }
  group: {
    merge: (target: {
      nodeIds?: readonly NodeId[]
      edgeIds?: readonly EdgeId[]
    }) => CommandResult<{ groupId: GroupId }>
    order: {
      set: (ids: GroupId[]) => CommandResult
      bringToFront: (ids: GroupId[]) => CommandResult
      sendToBack: (ids: GroupId[]) => CommandResult
      bringForward: (ids: GroupId[]) => CommandResult
      sendBackward: (ids: GroupId[]) => CommandResult
    }
    ungroup: (id: GroupId) => CommandResult<{
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }>
    ungroupMany: (ids: GroupId[]) => CommandResult<{
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }>
  }
}

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
