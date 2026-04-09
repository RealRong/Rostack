import type {
  ClipboardPacket,
  Slice,
  SliceInsertOptions,
  SliceInsertResult
} from '@whiteboard/core/document'
import type { Viewport } from '@whiteboard/core/types'
import type {
  CanvasItemRef,
  Document,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgePatch,
  EdgeTextMode,
  EdgeType,
  GroupId,
  NodeId
} from '@whiteboard/core/types'
import type { SelectionInput } from '@whiteboard/core/selection'
import type { CommandResult } from '@engine-types/result'
import type { ViewportInputRuntime } from '../viewport'
import type { EdgeOverlayEntry, EdgeGuide, MindmapDragFeedback } from '../overlay'
import type { TextPreviewPatch } from '../overlay/types'
import type { DrawPreview } from '../../types/draw'
import type {
  Editor,
  EditorClipboardOptions,
  EditorClipboardTarget,
  EditorDocumentApi,
  EditorDrawActions,
  EditorEdgeLabelPatch,
  EditorEdgesApi,
  EditorHistoryApi,
  EditorMindmapCommands,
  EditorNodesApi,
  EditorOrderMode,
  EditorSessionActions,
  EditorViewActions,
  EditorViewportActions
} from '../../types/editor'
import type {
  NodeAppearanceMutations,
  NodeLockMutations,
  NodePatchWriter,
  NodeShapeMutations,
  NodeTextMutations
} from '../node/types'

export type ClipboardActions = {
  export: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  cut: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  insert: (
    packet: ClipboardPacket,
    options?: EditorClipboardOptions
  ) => boolean
}

export type OrderMode = EditorOrderMode

export type CanvasActions = {
  duplicate: (
    target: SelectionInput,
    options?: {
      selectInserted?: boolean
    }
  ) => boolean
  delete: (
    target: SelectionInput,
    options?: {
      clearSelection?: boolean
    }
  ) => boolean
  order: (
    target: SelectionInput,
    mode: OrderMode
  ) => boolean
}

export type GroupActions = {
  merge: (
    target: SelectionInput,
    options?: {
      selectResult?: boolean
    }
  ) => boolean
  ungroup: (
    target: SelectionInput,
    options?: {
      fallbackSelection?: 'members' | 'none'
    }
  ) => boolean
  order: (
    groupIds: readonly string[],
    mode: OrderMode
  ) => boolean
}

export type FrameActions = {
  createFromBounds: (
    bounds: {
      x: number
      y: number
      width: number
      height: number
    },
    options?: {
      padding?: number
    }
  ) => boolean
}

export type EdgesPatch = {
  type?: EdgeType
  textMode?: EdgeTextMode
}

export type EdgeStylePatch = {
  color?: string
  width?: number
  dash?: EdgeDash
  start?: EdgeMarker
  end?: EdgeMarker
}

export type EdgeStyleActions = {
  set: (
    edgeIds: readonly EdgeId[],
    patch: EdgeStylePatch
  ) => CommandResult | undefined
  swapMarkers: (edgeId: EdgeId) => CommandResult | undefined
}

export type EdgeLabelActions = {
  add: (edgeId: EdgeId) => string | undefined
  update: (
    edgeId: EdgeId,
    labelId: string,
    patch: EditorEdgeLabelPatch
  ) => CommandResult | undefined
  remove: (edgeId: EdgeId, labelId: string) => CommandResult | undefined
}

export type EdgeActions = {
  create: EditorEdgesApi['create']
  move: EditorEdgesApi['move']
  reconnect: EditorEdgesApi['reconnect']
  delete: EditorEdgesApi['remove']
  route: EditorEdgesApi['route']
  set: (
    edgeIds: readonly EdgeId[],
    patch: EdgesPatch
  ) => CommandResult | undefined
  style: EdgeStyleActions
  labels: EdgeLabelActions
}

export type {
  EditorEdgeLabelPatch
} from '../../types/editor'

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

export type SessionRuntime = EditorSessionActions

export type ViewRuntime = {
  viewport: EditorViewportActions & Pick<ViewportInputRuntime, 'panScreenBy' | 'wheel'> & {
    set: (next: Viewport) => void
  }
  pointer: EditorViewActions['pointer']
  space: EditorViewActions['space']
  draw: EditorDrawActions
}

export type PreviewRuntime = {
  draw: {
    setPreview: (preview: DrawPreview | null) => void
    setHidden: (nodeIds: readonly NodeId[]) => void
    clear: () => void
  }
  node: {
    text: {
      set: (nodeId: NodeId, patch?: TextPreviewPatch) => void
      clear: (nodeId: NodeId) => void
      clearSize: (nodeId: NodeId) => void
    }
  }
  edge: {
    setInteraction: (entries: readonly EdgeOverlayEntry[]) => void
    setGuide: (guide?: EdgeGuide) => void
    clearPatches: () => void
    clearGuide: () => void
    clear: () => void
  }
  mindmap: {
    setDrag: (drag?: MindmapDragFeedback) => void
    clear: () => void
  }
}

export type EditorRuntimeChannels = {
  document: DocumentRuntime
  session: SessionRuntime
  view: ViewRuntime
  preview: PreviewRuntime
}

export type EditorRuntime = EditorRuntimeChannels & {
  batch: <T>(recipe: (tx: EditorRuntimeChannels) => T) => T
}

export type ClipboardRuntime = Pick<Editor, 'read'> & {
  document: Pick<DocumentRuntime, 'insert'>
  session: Pick<SessionRuntime, 'selection'>
  canvas: {
    delete: (
      target: {
        nodeIds?: readonly string[]
        edgeIds?: readonly string[]
      },
      options?: {
        clearSelection?: boolean
      }
    ) => boolean
  }
  state: Pick<Editor['state'], 'viewport' | 'selection'>
}
