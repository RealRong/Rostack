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
  Editor,
  EditorDocumentApi,
  EditorEdgesApi,
  EditorHistoryApi,
  EditorMindmapCommands,
  EditorNodesApi,
  EditorOrderMode,
  EditorSelectionApi
} from '../../types/editor'
import type {
  NodeAppearanceMutations,
  NodeLockMutations,
  NodePatchWriter,
  NodeShapeMutations,
  NodeTextMutations
} from '../node/types'
import type { SessionRuntime } from '../session/types'

export type OrderMode = EditorOrderMode

export type DocumentSelectionActions = Pick<
  EditorSelectionApi,
  'duplicate' | 'delete' | 'order' | 'group' | 'ungroup' | 'frame'
>

export type ClipboardRuntime = Pick<Editor, 'read'> & {
  document: Pick<DocumentRuntime, 'insert'>
  session: Pick<SessionRuntime, 'selection'>
  selection: Pick<EditorSelectionApi, 'delete'>
  state: Pick<Editor['state'], 'viewport' | 'selection'>
}

export type DocumentNodeTextApi = Pick<
  NodeTextMutations,
  'commit' | 'setColor' | 'setSize' | 'setWeight' | 'setItalic' | 'setAlign'
>

export type DocumentNodeApi = {
  create: EditorNodesApi['create']
  move: EditorNodesApi['move']
  align: EditorNodesApi['align']
  distribute: EditorNodesApi['distribute']
  delete: (ids: NodeId[]) => CommandResult
  deleteCascade: EditorNodesApi['remove']
  duplicate: EditorNodesApi['duplicate']
  update: NodePatchWriter['update']
  updateMany: NodePatchWriter['updateMany']
  lock: NodeLockMutations
  text: DocumentNodeTextApi
  shape: NodeShapeMutations
  appearance: NodeAppearanceMutations
}

export type DocumentRuntime = {
  replace: EditorDocumentApi['replace']
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
