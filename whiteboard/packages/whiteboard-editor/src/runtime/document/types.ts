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
import type { CommandResult } from '@engine-types/result'
import type {
  HistoryCommands,
  OrderMode
} from '../../types/commands'

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
  history: HistoryCommands
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
