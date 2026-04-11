import type {
  Slice,
  SliceInsertOptions,
  SliceInsertResult
} from '@whiteboard/core/document'
import type {
  CanvasItemRef,
  Document,
  EdgeId,
  EdgePatch,
  GroupId,
  NodeId
} from '@whiteboard/core/types'
import type { CommandResult } from '@engine-types/result'
import type {
  EditorDocumentApi,
  EditorEdgesApi,
  EditorHistoryApi,
  EditorMindmapCommands,
  EditorNodesApi,
  EditorOrderMode
} from '../../types/editor'
import type {
  NodePatchWriter,
  NodeTextMutations
} from '../node/types'
import type { NodeMutations } from '../node/mutations'

export type DocumentNodeTextApi = Pick<
  NodeTextMutations,
  'commit' | 'setColor' | 'setSize' | 'setWeight' | 'setItalic' | 'setAlign'
>

export type DocumentNodeApi = {
  create: EditorNodesApi['create']
  patch: EditorNodesApi['patch']
  move: EditorNodesApi['move']
  align: EditorNodesApi['align']
  distribute: EditorNodesApi['distribute']
  delete: (ids: NodeId[]) => CommandResult
  deleteCascade: EditorNodesApi['remove']
  duplicate: EditorNodesApi['duplicate']
  update: NodePatchWriter['update']
  updateMany: NodePatchWriter['updateMany']
  lock: NodeMutations['lock']
  text: DocumentNodeTextApi
  shape: NodeMutations['shape']
  appearance: NodeMutations['appearance']
}

export type DocumentRuntime = {
  replace: EditorDocumentApi['replace']
  insert: (
    slice: Slice,
    options?: SliceInsertOptions
  ) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  delete: (refs: CanvasItemRef[]) => CommandResult
  duplicate: (refs: CanvasItemRef[]) => CommandResult<Omit<SliceInsertResult, 'operations'>>
  order: (refs: CanvasItemRef[], mode: EditorOrderMode) => CommandResult
  background: {
    set: (background?: Document['background']) => CommandResult
  }
  history: EditorHistoryApi
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
  edge: {
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
  node: DocumentNodeApi
  mindmap: EditorMindmapCommands
}
