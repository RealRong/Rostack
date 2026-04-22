import type {
  CanvasItemRef,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  Viewport
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type { Flags, Family, Ids, Revision } from './core'
import type * as trace from './trace'

export interface Input {
  document: DocumentInput
  session: SessionInput
  measure: MeasureInput
  interaction: InteractionInput
  viewport: ViewportInput
  clock: ClockInput
}

export interface DocumentInput {
  snapshot: document.Snapshot
}

export interface SessionInput {
  edit?: unknown
  preview?: unknown
  tool?: unknown
}

export interface MeasureInput {
  text?: unknown
}

export interface InteractionInput {
  selection?: {
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
  }
  hover?: unknown
  drag?: unknown
}

export interface ViewportInput {
  viewport?: Viewport
}

export interface ClockInput {
  now?: number
}

export interface InputChange {
  document: Flags
  session: Flags
  measure: Flags
  interaction: Flags
  viewport: Flags
  clock: Flags
}

export interface Snapshot {
  revision: Revision
  base: BaseSnapshot
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}

export interface BaseSnapshot {
  documentRevision: Revision
  inputRevision: Revision
}

export interface NodeView {
  node: Node
  owner?: document.OwnerRef
}

export interface EdgeView {
  edge: Edge
  nodes: document.EdgeNodes
}

export interface MindmapView {
  mindmap: MindmapRecord
  nodeIds: readonly NodeId[]
}

export interface GroupView {
  group: Group
  items: readonly CanvasItemRef[]
}

export interface GraphSnapshot {
  nodes: Family<NodeId, NodeView>
  edges: Family<EdgeId, EdgeView>
  owners: OwnerViews
}

export interface OwnerViews {
  mindmaps: Family<MindmapId, MindmapView>
  groups: Family<GroupId, GroupView>
}

export type SceneLayer =
  | 'owners'
  | 'edges'
  | 'nodes'
  | 'ui'

export type SceneItem =
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }

export interface SpatialView {
  nodes: readonly NodeId[]
  edges: readonly EdgeId[]
}

export interface PickView {
  items: readonly CanvasItemRef[]
}

export interface SceneSnapshot {
  layers: readonly SceneLayer[]
  items: readonly SceneItem[]
  spatial: SpatialView
  pick: PickView
}

export interface SelectionView {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

export interface ChromeView {
  overlays: readonly string[]
}

export interface UiSnapshot {
  selection: SelectionView
  chrome: ChromeView
}

export interface Change {
  graph: GraphChange
  scene: Flags
  ui: UiChange
}

export interface GraphChange {
  nodes: Ids<NodeId>
  edges: Ids<EdgeId>
  owners: OwnerChange
}

export interface OwnerChange {
  mindmaps: Ids<MindmapId>
  groups: Ids<GroupId>
}

export interface UiChange {
  selection: Flags
  chrome: Flags
}

export interface Runtime {
  snapshot(): Snapshot
  update(input: Input, change: InputChange): Result
  subscribe(listener: (snapshot: Snapshot, change: Change) => void): () => void
}

export interface Result {
  snapshot: Snapshot
  change: Change
  trace?: trace.Run
}

export interface Read {
  snapshot(): Snapshot
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined
}
