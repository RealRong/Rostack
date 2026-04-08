import type { BoardConfig } from '@whiteboard/core/config'
import type { MindmapLayoutConfig } from '@whiteboard/core/mindmap'
import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from './projection'
import type {
  HistoryConfig,
  HistoryState
} from '@whiteboard/core/kernel'
import type { SnapCandidate } from '@whiteboard/core/node'
import type {
  NodeRectHitOptions,
  TransformSelectionTargets
} from '@whiteboard/core/node'
import type {
  CanvasItemRef,
  CoreRegistries,
  Group,
  GroupId,
  Document,
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
} from '@shared/store'
import type { EngineCommands } from './command'
import type { Commit } from './commit'
import type { CommandResult } from './result'
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
  snap: {
    all: () => SnapCandidate[]
    inRect: (rect: Rect) => SnapCandidate[]
  }
}

export type NodeRead = {
  list: ReadStore<readonly NodeId[]>
  item: KeyedReadStore<NodeId, Readonly<NodeItem> | undefined>
  geometry: (nodeId: NodeId) => NodeGeometry | undefined
  rect: (nodeId: NodeId) => Rect | undefined
  bounds: (nodeId: NodeId) => Rect | undefined
  idsInRect: (rect: Rect, options?: NodeRectHitOptions) => NodeId[]
  transformTargets: (
    nodeIds: readonly NodeId[]
  ) => TransformSelectionTargets<Node> | undefined
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
  members: (groupId: GroupId) => readonly CanvasItemRef[]
  nodeIds: (groupId: GroupId) => readonly NodeId[]
  edgeIds: (groupId: GroupId) => readonly EdgeId[]
  bounds: (groupId: GroupId) => Rect | undefined
  wholeIds: (target: SelectionTarget) => readonly GroupId[]
  exactIds: (target: SelectionTarget) => readonly GroupId[]
}

export type EdgeRead = {
  list: ReadStore<readonly EdgeId[]>
  item: KeyedReadStore<EdgeId, Readonly<EdgeItem> | undefined>
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
}

export type MindmapRead = {
  list: ReadStore<readonly NodeId[]>
  item: KeyedReadStore<NodeId, Readonly<MindmapItem> | undefined>
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
  node: NodeRead
  edge: EdgeRead
  mindmap: MindmapRead
  slice: SliceRead
  index: EngineReadIndex
}

export type EngineRuntimeOptions = {
  mindmapLayout: MindmapLayoutConfig
  history?: Partial<HistoryConfig>
}

export type EngineInstance = {
  config: Readonly<BoardConfig>
  document: {
    get: () => Document
  }
  read: EngineRead
  history: ReadStore<HistoryState>
  commit: ReadStore<Commit | null>
  commands: EngineCommands
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
