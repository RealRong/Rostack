import type { BoardConfig } from '@whiteboard/core/config'
import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  CanvasNode,
  EdgeItem,
  MindmapItem,
  NodeItem
} from '@whiteboard/engine/types/projection'
import type { SnapCandidate } from '@whiteboard/core/node'
import type { NodeRectHitOptions } from '@whiteboard/core/node/hitTest'
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
import { store } from '@shared/core'
import type {
  BatchApplyOptions,
  Command,
  ExecuteOptions,
  ExecuteResult
} from '@whiteboard/engine/types/command'
import type { EngineWrite } from '@whiteboard/engine/types/engineWrite'
import type { CommandResult } from '@whiteboard/engine/types/result'
import type { SelectionTarget } from '@whiteboard/core/selection'
export type { BoardConfig } from '@whiteboard/core/config'

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
  list: store.ReadStore<readonly NodeId[]>
  item: store.KeyedReadStore<NodeId, Readonly<NodeItem> | undefined>
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
  list: store.ReadStore<readonly EdgeId[]>
  item: store.KeyedReadStore<EdgeId, Readonly<EdgeItem> | undefined>
  edges: (edgeIds: readonly EdgeId[]) => readonly Edge[]
  related: (nodeIds: Iterable<NodeId>) => readonly EdgeId[]
  idsInRect: (rect: Rect, options?: EdgeRectHitOptions) => EdgeId[]
}

export type MindmapRead = {
  list: store.ReadStore<readonly NodeId[]>
  item: store.KeyedReadStore<NodeId, Readonly<MindmapItem> | undefined>
}

export type SceneRead = {
  list: store.ReadStore<readonly CanvasItemRef[]>
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
    background: store.ReadStore<Document['background'] | undefined>
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

export type EngineRuntimeOptions = {}

export type Engine = {
  config: Readonly<BoardConfig>
  document: {
    get: () => Document
  }
  read: EngineRead
  write: store.ReadStore<EngineWrite | null>
  execute: <C extends Command>(
    command: C,
    options?: ExecuteOptions
  ) => ExecuteResult<C>
  apply: (
    ops: readonly Operation[],
    options?: BatchApplyOptions
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
