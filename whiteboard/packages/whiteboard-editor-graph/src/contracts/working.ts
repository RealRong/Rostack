import type {
  CanvasItemRef,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Rect
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type { Revision } from '@shared/projection-runtime'
import type {
  ChromeView,
  EdgePreview,
  EdgeView,
  HoverState,
  Input,
  MindmapView,
  NodeDraft,
  NodePreview,
  NodeView,
  SceneItem,
  SceneLayer,
  SelectionView,
  TextMeasureEntry
} from './editor'
import type { Token } from './impact'

export interface WorkingState {
  input: InputWorkingState
  graph: GraphWorkingState
  measure: MeasureWorkingState
  structure: StructureWorkingState
  tree: TreeWorkingState
  element: ElementWorkingState
  ui: UiWorkingState
  scene: SceneWorkingState
}

export interface InputWorkingState {
  revision: {
    document: Revision
    input: Revision
  }
  document: {
    snapshot: document.Snapshot
  }
  session: Input['session']
  measure: Input['measure']
  interaction: Input['interaction']
  viewport: Input['viewport']
  clock: Input['clock']
  impact: readonly Token[]
}

export interface GraphWorkingState {
  nodes: ReadonlyMap<NodeId, GraphNodeEntry>
  edges: ReadonlyMap<EdgeId, GraphEdgeEntry>
  owners: {
    mindmaps: ReadonlyMap<MindmapId, GraphMindmapEntry>
    groups: ReadonlyMap<GroupId, GraphGroupEntry>
  }
  dirty: {
    nodeIds: ReadonlySet<NodeId>
    edgeIds: ReadonlySet<EdgeId>
    mindmapIds: ReadonlySet<MindmapId>
    groupIds: ReadonlySet<GroupId>
  }
}

export interface GraphNodeEntry {
  base: NodeView['base']
  draft?: NodeDraft
  preview?: NodePreview
}

export interface GraphEdgeEntry {
  base: EdgeView['base']
  preview?: EdgePreview
}

export interface GraphMindmapEntry {
  base: MindmapView['base']
  nodeIds: readonly NodeId[]
}

export interface GraphGroupEntry {
  items: readonly GroupItemRef[]
}

export type GroupItemRef = CanvasItemRef

export interface MeasureWorkingState {
  nodes: ReadonlyMap<NodeId, TextMeasureEntry>
  edgeLabels: ReadonlyMap<EdgeId, ReadonlyMap<string, TextMeasureEntry>>
  dirty: {
    nodeIds: ReadonlySet<NodeId>
    edgeIds: ReadonlySet<EdgeId>
  }
}

export interface StructureWorkingState {
  mindmaps: ReadonlyMap<MindmapId, MindmapStructureState>
  groups: ReadonlyMap<GroupId, GroupStructureState>
}

export interface MindmapStructureState {
  rootNodeId: NodeId
  nodeIds: readonly NodeId[]
  collapsedNodeIds: ReadonlySet<NodeId>
}

export interface GroupStructureState {
  itemIds: readonly GroupItemRef[]
}

export interface TreeWorkingState {
  mindmaps: ReadonlyMap<MindmapId, MindmapTreeState>
}

export interface MindmapTreeState {
  nodeRects: ReadonlyMap<NodeId, Rect>
  bbox?: Rect
}

export interface ElementWorkingState {
  nodes: ReadonlyMap<NodeId, NodeView>
  edges: ReadonlyMap<EdgeId, EdgeView>
}

export interface UiWorkingState {
  selection: SelectionView
  chrome: ChromeView
  hover: HoverState
}

export interface SceneWorkingState {
  layers: readonly SceneLayer[]
  items: readonly SceneItem[]
  visible: {
    nodeIds: readonly NodeId[]
    edgeIds: readonly EdgeId[]
    mindmapIds: readonly MindmapId[]
  }
}
