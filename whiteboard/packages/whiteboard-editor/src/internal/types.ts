import type { ClipboardPacket } from '@whiteboard/core/document'
import type { ResizeDirection, TextWidthMode } from '@whiteboard/core/node'
import type { Viewport } from '@whiteboard/core/types'
import type {
  CanvasItemRef,
  EdgeDash,
  EdgeId,
  EdgeMarker,
  EdgeTextMode,
  EdgeType,
  NodeId
} from '@whiteboard/core/types'
import type { SelectionInput } from '@whiteboard/core/selection'
import type { EngineInstance } from '@engine-types/instance'
import type { CommandResult } from '@engine-types/result'
import type { ViewportInputRuntime } from '../runtime/viewport'
import type { EdgeOverlayEntry, EdgeGuide, MindmapDragFeedback } from '../runtime/overlay'
import type { TextPreviewPatch } from '../runtime/overlay/types'
import type { DrawPreview } from '../types/draw'
import type {
  Editor,
  EditorClipboardOptions,
  EditorClipboardTarget,
  EditorDrawActions,
  EditorEdgeLabelPatch,
  EditorMindmapCommands,
  EditorSessionActions,
  EditorViewActions,
  EditorViewportActions
} from '../types/editor'

type EngineApi = EngineInstance['commands']
type EngineNodeApi = EngineApi['node']

export type NodePatchWriter = {
  update: EngineNodeApi['update']
  updateMany: EngineNodeApi['updateMany']
}

export type NodeLockMutations = {
  set: (nodeIds: readonly NodeId[], locked: boolean) => CommandResult
  toggle: (nodeIds: readonly NodeId[]) => CommandResult
}

export type NodeTextMutations = {
  preview: (input: {
    nodeId: NodeId
    position?: {
      x: number
      y: number
    }
    size?: {
      width: number
      height: number
    }
    fontSize?: number
    mode?: TextWidthMode
    handle?: ResizeDirection
  }) => void
  clearPreview: (nodeId: NodeId) => void
  cancel: (input: {
    nodeId: NodeId
  }) => void
  commit: (input: {
    nodeId: NodeId
    field: 'text' | 'title'
    value: string
    size?: {
      width: number
      height: number
    }
  }) => CommandResult | undefined
  setColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
  setSize: (input: {
    nodeIds: readonly NodeId[]
    value?: number
    sizeById?: Readonly<Record<NodeId, { width: number; height: number }>>
  }) => CommandResult
  setWeight: (nodeIds: readonly NodeId[], weight?: number) => CommandResult
  setItalic: (nodeIds: readonly NodeId[], italic: boolean) => CommandResult
  setAlign: (
    nodeIds: readonly NodeId[],
    align?: 'left' | 'center' | 'right'
  ) => CommandResult
}

export type NodeShapeMutations = {
  setKind: (nodeIds: readonly NodeId[], kind: string) => CommandResult
}

export type NodeAppearanceMutations = {
  setFill: (nodeIds: readonly NodeId[], fill: string) => CommandResult
  setFillOpacity: (nodeIds: readonly NodeId[], opacity?: number) => CommandResult
  setStroke: (nodeIds: readonly NodeId[], stroke: string) => CommandResult
  setStrokeWidth: (nodeIds: readonly NodeId[], width: number) => CommandResult
  setStrokeOpacity: (nodeIds: readonly NodeId[], opacity?: number) => CommandResult
  setStrokeDash: (nodeIds: readonly NodeId[], dash?: readonly number[]) => CommandResult
  setOpacity: (nodeIds: readonly NodeId[], opacity: number) => CommandResult
  setTextColor: (nodeIds: readonly NodeId[], color: string) => CommandResult
}

export type ClipboardActions = {
  export: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  cut: (target?: EditorClipboardTarget) => ClipboardPacket | undefined
  insert: (
    packet: ClipboardPacket,
    options?: EditorClipboardOptions
  ) => boolean
}

export type CanvasOrderMode =
  | 'front'
  | 'back'
  | 'forward'
  | 'backward'

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
    mode: CanvasOrderMode
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
    mode: CanvasOrderMode
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
  create: EngineApi['edge']['create']
  move: EngineApi['edge']['move']
  reconnect: EngineApi['edge']['reconnect']
  delete: EngineApi['edge']['delete']
  route: EngineApi['edge']['route']
  set: (
    edgeIds: readonly EdgeId[],
    patch: EdgesPatch
  ) => CommandResult | undefined
  style: EdgeStyleActions
  labels: EdgeLabelActions
}

export type {
  EditorEdgeLabelPatch
} from '../types/editor'

export type DocumentNodeTextApi = Pick<
  NodeTextMutations,
  'commit' | 'setColor' | 'setSize' | 'setWeight' | 'setItalic' | 'setAlign'
>

export type DocumentNodeApi = Omit<EngineNodeApi, 'update' | 'updateMany'> & {
  update: NodePatchWriter['update']
  updateMany: NodePatchWriter['updateMany']
  lock: NodeLockMutations
  text: DocumentNodeTextApi
  shape: NodeShapeMutations
  appearance: NodeAppearanceMutations
}

export type DocumentRuntime = {
  replace: EngineApi['document']['replace']
  insert: EngineApi['document']['insert']
  delete: EngineApi['document']['delete']
  duplicate: EngineApi['document']['duplicate']
  order: (refs: CanvasItemRef[], mode: CanvasOrderMode) => CommandResult
  background: EngineApi['document']['background']
  history: EngineApi['history']
  group: EngineApi['group']
  edge: EngineApi['edge']
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
