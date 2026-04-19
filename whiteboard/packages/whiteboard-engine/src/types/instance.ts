import type { BoardConfig } from '@whiteboard/core/config'
import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from '@whiteboard/engine/types/projection'
import type {
  HistoryConfig,
  HistoryState
} from '@whiteboard/core/kernel'
import type { SnapCandidate } from '@whiteboard/core/node'
import type {
  NodeRectHitOptions
} from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  CoreRegistries,
  Group,
  GroupId,
  Document,
  Edge,
  EdgeId,
  NodeGeometry,
  Node,
  NodeId,
  Operation,
  Origin,
  Point,
  Rect
} from '@whiteboard/core/types'
import type {
  KeyedReadStore,
  ReadStore
} from '@shared/core'
import type {
  EngineCommand,
  ExecuteOptions,
  ExecuteResult
} from '@whiteboard/engine/types/command'
import type { Commit } from '@whiteboard/engine/types/commit'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { SelectionTarget } from '@whiteboard/core/selection'
export type { BoardConfig } from '@whiteboard/core/config'

export type ApplyOperationsOptions = {
  origin?: Origin
}

export type EngineReadIndex = {
  node: {
    all: () => CanvasNode[]
    get: (nodeId: NodeId) => CanvasNode | undefined
    idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  }
  edge: {
    idsInRect: (rect: Rect) => EdgeId[]
  }
  snap: {
    all: () => SnapCandidate[]
    inRect: (rect: Rect) => SnapCandidate[]
  }
}

export type EdgeRectHitOptions = {
  match?: 'touch' | 'contain'
}

export type NodeRead = {
  list: ReadStore<readonly NodeId[]>
  item: KeyedReadStore<NodeId, Readonly<NodeItem> | undefined>
  nodes: (nodeIds: readonly NodeId[]) => readonly Node[]
  geometry: (nodeId: NodeId) => NodeGeometry | undefined
  rect: (nodeId: NodeId) => Rect | undefined
  bounds: (nodeId: NodeId) => Rect | undefined
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
}

export type FrameRead = {
  list: () => readonly NodeId[]
  rect: (frameId: NodeId) => Rect | undefined
  at: (point: Point) => NodeId | undefined
  of: (nodeId: NodeId) => NodeId | undefined
  members: (
    frameId: NodeId,
    options?: {
      deep?: boolean
    }
  ) => readonly NodeId[]
  contains: (
    frameId: NodeId,
    nodeId: NodeId,
    options?: {
      deep?: boolean
    }
  ) => boolean
}

export type GroupRead = {
  list: () => readonly GroupId[]
  item: (groupId: GroupId) => Group | undefined
  ofNode: (nodeId: NodeId) => GroupId | undefined
  ofEdge: (edgeId: EdgeId) => GroupId | undefined
  target: (groupId: GroupId) => SelectionTarget | undefined
  members: (groupId: GroupId) => readonly CanvasItemRef[]
  bounds: (groupId: GroupId) => Rect | undefined
  wholeIds: (target: SelectionTarget) => readonly GroupId[]
  exactIds: (target: SelectionTarget) => readonly GroupId[]
}

export type TargetRead = {
  nodes: (target: SelectionTarget) => readonly Node[]
  edges: (target: SelectionTarget) => readonly Edge[]
  bounds: (target: SelectionTarget) => Rect | undefined
}

export type EdgeRead = {
  list: ReadStore<readonly EdgeId[]>
  item: KeyedReadStore<EdgeId, Readonly<EdgeItem> | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: EdgeRectHitOptions) => EdgeId[]
}

export type MindmapRead = {
  list: ReadStore<readonly NodeId[]>
  item: KeyedReadStore<NodeId, Readonly<MindmapItem> | undefined>
}

export type SceneRead = {
  list: ReadStore<readonly CanvasItemRef[]>
}

export type SliceRead = {
  fromNodes: (nodeIds: readonly NodeId[]) => SliceExportResult | undefined
  fromEdge: (edgeId: EdgeId) => SliceExportResult | undefined
  fromSelection: (selection: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }) => SliceExportResult | undefined
}

export type EngineRead = {
  document: {
    background: ReadStore<Document['background'] | undefined>
    bounds: () => Rect | undefined
  }
  frame: FrameRead
  group: GroupRead
  target: TargetRead
  node: NodeRead
  edge: EdgeRead
  mindmap: MindmapRead
  scene: SceneRead
  slice: SliceRead
  index: EngineReadIndex
}

export type EngineRuntimeOptions = {
  history?: Partial<HistoryConfig>
}

export type EngineHistory = ReadStore<HistoryState> & {
  undo: () => CommandResult
  redo: () => CommandResult
  clear: () => void
}

export type Engine = {
  config: Readonly<BoardConfig>
  document: {
    get: () => Document
  }
  read: EngineRead
  history: EngineHistory
  commit: ReadStore<Commit | null>
  execute: <C extends EngineCommand>(
    command: C,
    options?: ExecuteOptions
  ) => ExecuteResult<C>
  applyOperations: (
    operations: readonly Operation[],
    options?: ApplyOperationsOptions
  ) => CommandResult
  configure: (config: EngineRuntimeOptions) => void
  dispose: () => void
}

export type EngineDocument = {
  get: () => Document
  commit: (document: Document) => void
}

export type CreateEngineOptions = {
  registries?: CoreRegistries
  /**
   * Engine treats document input as immutable data.
   * Replacing or loading with the same document reference is unsupported.
   */
  document: Document
  onDocumentChange?: (document: Document) => void
  config?: Partial<BoardConfig>
}
