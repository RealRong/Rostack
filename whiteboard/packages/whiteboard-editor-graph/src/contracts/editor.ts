import type {
  ConnectResolution,
  EdgeLabelMaskRect,
  ResolvedEdgeEnds
} from '@whiteboard/core/edge'
import type { EdgeHandle } from '@whiteboard/core/types/edge'
import type { Guide, TransformPreviewPatch } from '@whiteboard/core/node'
import type { SelectionTransformHandlePlan } from '@whiteboard/core/node'
import type { MindmapRenderConnector } from '@whiteboard/core/mindmap'
import type {
  SelectionAffordanceMoveHit,
  SelectionAffordanceOwner
} from '@whiteboard/core/selection'
import type {
  CanvasItemRef,
  Edge,
  EdgeId,
  EdgePatch,
  EdgeTemplate,
  Group,
  GroupId,
  MindmapDragDropTarget,
  MindmapId,
  MindmapLayout,
  MindmapRecord,
  MindmapTemplate,
  NodeModel,
  NodeFieldPatch,
  NodeId,
  NodeTemplate,
  Point,
  Rect,
  Size,
  Viewport
} from '@whiteboard/core/types'
import type * as document from '@whiteboard/engine/contracts/document'
import type {
  Family,
  Flags,
  Ids,
  Revision,
  TraceRun
} from '@shared/projection-runtime'

export interface Input {
  document: DocumentInput
  session: SessionInput
  measure: MeasureInput
  interaction: InteractionInput
  viewport: ViewportInput
  clock: ClockInput
  delta: InputDelta
}

export interface DocumentInput {
  snapshot: document.Snapshot
}

export interface SessionInput {
  edit: EditSession | null
  draft: DraftInput
  preview: PreviewInput
  tool: ToolState
}

export type EditField = 'text' | 'title'

export type EditCaret =
  | {
      kind: 'end'
    }
  | {
      kind: 'point'
      client: Point
    }

export type NodeEditSession = {
  kind: 'node'
  nodeId: NodeId
  field: EditField
  text: string
  composing: boolean
  caret: EditCaret
}

export type EdgeLabelEditSession = {
  kind: 'edge-label'
  edgeId: EdgeId
  labelId: string
  text: string
  composing: boolean
  caret: EditCaret
}

export type EditSession =
  | NodeEditSession
  | EdgeLabelEditSession

export interface DraftInput {
  nodes: ReadonlyMap<NodeId, NodeDraft>
  edges: ReadonlyMap<EdgeId, EdgeDraft>
}

export type DraftNodePatch = Pick<
  NodeFieldPatch,
  'position' | 'size' | 'rotation'
>

export type NodeDraft =
  | {
      kind: 'patch'
      fields: DraftNodePatch
    }
  | {
      kind: 'size'
      size: Size
    }
  | {
      kind: 'fit'
      fontSize: number
    }

export interface EdgeDraft {
  patch?: EdgePatch
  activeRouteIndex?: number
}

export interface PreviewInput {
  nodes: ReadonlyMap<NodeId, NodePreview>
  edges: ReadonlyMap<EdgeId, EdgePreview>
  draw: DrawPreview | null
  selection: SelectionPreview
  mindmap: MindmapPreview | null
}

export type NodePreviewPatch = Omit<TransformPreviewPatch, 'id'>

export interface NodePreview {
  patch?: NodePreviewPatch
  hovered: boolean
  hidden: boolean
}

export interface EdgePreview {
  patch?: EdgePatch
  activeRouteIndex?: number
}

export type SelectionMarqueeMatch = 'touch' | 'contain'
export type DrawBrushKind = 'pen' | 'highlighter'

export interface DrawStyle {
  kind: DrawBrushKind
  color: string
  width: number
  opacity: number
}

export interface DrawPreview {
  kind: DrawBrushKind
  style: DrawStyle
  points: readonly Point[]
  bounds?: Rect
  hiddenNodeIds: readonly NodeId[]
}

export interface SelectionPreview {
  marquee?: {
    worldRect: Rect
    match: SelectionMarqueeMatch
  }
  guides: readonly Guide[]
}

export interface MindmapEnterPreview {
  mindmapId: MindmapId
  nodeId: NodeId
  parentId: NodeId
  route: readonly Point[]
  fromRect: Rect
  toRect: Rect
  startedAt: number
  durationMs: number
}

export interface MindmapPreview {
  rootMove?: {
    mindmapId: MindmapId
    delta: Point
  }
  subtreeMove?: {
    mindmapId: MindmapId
    nodeId: NodeId
    ghost: Rect
    drop?: MindmapDragDropTarget
  }
  enter?: readonly MindmapEnterPreview[]
}

export type ToolState =
  | {
      type: 'select'
    }
  | {
      type: 'hand'
    }
  | {
      type: 'edge'
      template: EdgeTemplate
    }
  | {
      type: 'insert'
      template: InsertTemplate
    }
  | {
      type: 'draw'
      mode: string
    }

export type InsertTemplate =
  | {
      kind: 'node'
      template: NodeTemplate
      placement?: 'point' | 'center'
      editField?: EditField
    }
  | {
      kind: 'mindmap'
      template: MindmapTemplate
      focus?: 'edit-root' | 'select-root'
    }

export interface MeasureInput {
  text: TextMeasureInput
}

export interface TextMeasureInput {
  ready: boolean
  nodes: ReadonlyMap<NodeId, TextMeasureEntry>
  edgeLabels: ReadonlyMap<EdgeId, ReadonlyMap<string, TextMeasureEntry>>
}

export interface TextMeasureEntry {
  size: Size
  metrics: TextMetrics
  mode: 'single-line' | 'multi-line'
  wrapWidth?: number
}

export interface TextMetrics {
  width: number
  height: number
}

export interface InteractionInput {
  selection: SelectionState
  hover: HoverState
  drag: DragState
}

export interface SelectionState {
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
}

export type HoverState =
  | {
      kind: 'none'
    }
  | {
      kind: 'node'
      nodeId: NodeId
    }
  | {
      kind: 'edge'
      edgeId: EdgeId
    }
  | {
      kind: 'mindmap'
      mindmapId: MindmapId
    }
  | {
      kind: 'group'
      groupId: GroupId
    }
  | {
      kind: 'selection-box'
    }

export type DragState =
  | {
      kind: 'idle'
    }
  | {
      kind: 'selection-move'
      nodeIds: readonly NodeId[]
      edgeIds: readonly EdgeId[]
    }
  | {
      kind: 'selection-marquee'
      worldRect: Rect
      match: SelectionMarqueeMatch
    }
  | {
      kind: 'selection-transform'
      nodeIds: readonly NodeId[]
    }
  | {
      kind: 'edge-connect'
      edgeId?: EdgeId
      resolution?: ConnectResolution
    }
  | {
      kind: 'edge-move'
      edgeId: EdgeId
    }
  | {
      kind: 'edge-label'
      edgeId: EdgeId
      labelId: string
    }
  | {
      kind: 'edge-route'
      edgeId: EdgeId
    }
  | {
      kind: 'draw'
    }
  | {
      kind: 'mindmap-drag'
      mindmapId: MindmapId
      nodeId: NodeId
    }

export interface ViewportInput {
  viewport: Viewport
  visibleWorld?: Rect
}

export interface ClockInput {
  now: number
}

export interface InputDelta {
  document: DocumentDelta
  graph: GraphInputDelta
  ui: UiInputDelta
  scene: SceneInputDelta
}

export interface DocumentDelta {
  reset: boolean
  order: boolean
  nodes: document.IdDelta<NodeId>
  edges: document.IdDelta<EdgeId>
  mindmaps: document.IdDelta<MindmapId>
  groups: document.IdDelta<GroupId>
}

export interface GraphInputDelta {
  nodes: {
    draft: document.IdDelta<NodeId>
    preview: document.IdDelta<NodeId>
    edit: document.IdDelta<NodeId>
  }
  edges: {
    preview: document.IdDelta<EdgeId>
    edit: document.IdDelta<EdgeId>
  }
  mindmaps: {
    preview: document.IdDelta<MindmapId>
    tick: ReadonlySet<MindmapId>
  }
  interaction: {
    selection: boolean
    drag: boolean
  }
}

export interface UiInputDelta {
  tool: boolean
  selection: boolean
  marquee: boolean
  guides: boolean
  draw: boolean
  edit: boolean
}

export interface SceneInputDelta {
  viewport: boolean
}

export interface Snapshot {
  revision: Revision
  documentRevision: Revision
  graph: GraphSnapshot
  scene: SceneSnapshot
  ui: UiSnapshot
}

export interface GraphSnapshot {
  nodes: Family<NodeId, NodeView>
  edges: Family<EdgeId, EdgeView>
  owners: OwnerViews
}

export interface NodeView {
  base: NodeBaseView
  layout: NodeLayoutView
  render: NodeRenderView
}

export interface NodeBaseView {
  node: NodeModel
  owner?: document.OwnerRef
}

export interface NodeLayoutView {
  measuredSize?: Size
  rotation: number
  rect: Rect
  bounds: Rect
}

export interface NodeRenderView {
  hidden: boolean
  editing: boolean
  hovered: boolean
  selected: boolean
  patched: boolean
  resizing: boolean
  edit?: NodeRenderEdit
}

export interface NodeRenderEdit {
  field: EditField
  caret: EditCaret
}

export interface EdgeView {
  base: EdgeBaseView
  route: EdgeRouteView
  render: EdgeRenderView
}

export interface EdgeBaseView {
  edge: Edge
  nodes: document.EdgeNodes
}

export interface EdgeRouteView {
  points: readonly Point[]
  svgPath?: string
  bounds?: Rect
  source?: Point
  target?: Point
  ends?: ResolvedEdgeEnds
  handles: readonly EdgeHandle[]
  labels: readonly EdgeLabelView[]
}

export interface EdgeLabelView {
  labelId: string
  text: string
  displayText: string
  style: NonNullable<Edge['labels']>[number]['style']
  editable: boolean
  caret?: EditCaret
  size: Size
  point: Point
  angle: number
  rect: Rect
  maskRect: EdgeLabelMaskRect
}

export interface EdgeRenderView {
  hidden: boolean
  selected: boolean
  patched: boolean
  activeRouteIndex?: number
  box?: {
    rect: Rect
    pad: number
  }
  editingLabelId?: string
}

export interface OwnerViews {
  mindmaps: Family<MindmapId, MindmapView>
  groups: Family<GroupId, GroupView>
}

export interface MindmapView {
  base: MindmapBaseView
  structure: MindmapStructureView
  tree: MindmapTreeView
  render: MindmapRenderView
}

export interface MindmapBaseView {
  mindmap: MindmapRecord
}

export interface MindmapStructureView {
  nodeIds: readonly NodeId[]
}

export interface MindmapTreeView {
  layout?: MindmapLayout
  bbox?: Rect
}

export interface MindmapRenderView {
  connectors: readonly MindmapRenderConnector[]
}

export interface GroupView {
  base: GroupBaseView
  structure: GroupStructureView
  frame: GroupFrameView
}

export interface GroupBaseView {
  group: Group
}

export interface GroupStructureView {
  items: readonly CanvasItemRef[]
}

export interface GroupFrameView {
  bounds?: Rect
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
  mindmaps: readonly MindmapId[]
}

export interface VisibleSceneView {
  items: readonly SceneItem[]
  nodeIds: readonly NodeId[]
  edgeIds: readonly EdgeId[]
  mindmapIds: readonly MindmapId[]
}

export interface PickView {
  items: readonly CanvasItemRef[]
}

export interface SceneSnapshot {
  layers: readonly SceneLayer[]
  items: readonly SceneItem[]
  visible: VisibleSceneView
  spatial: SpatialView
  pick: PickView
}

export interface UiSnapshot {
  selection: SelectionView
  chrome: ChromeView
}

export interface SelectionView {
  target: SelectionState
  kind: 'none' | 'nodes' | 'edges' | 'mixed'
  summary: SelectionSummaryView
  affordance: SelectionAffordanceView
}

export interface SelectionSummaryView {
  box?: Rect
  count: number
  nodeCount: number
  edgeCount: number
  groupIds: readonly GroupId[]
}

export interface SelectionAffordanceView {
  owner: SelectionAffordanceOwner
  ownerNodeId?: NodeId
  displayBox?: Rect
  moveHit: SelectionAffordanceMoveHit
  canMove: boolean
  canResize: boolean
  canRotate: boolean
  handles: readonly SelectionTransformHandlePlan[]
}

export interface ChromeView {
  overlays: readonly ChromeOverlay[]
  hover: HoverState
  preview: ChromePreviewView
  edit: EditSession | null
}

export interface ChromePreviewView {
  marquee?: {
    worldRect: Rect
    match: SelectionMarqueeMatch
  }
  guides: readonly Guide[]
  draw: DrawPreview | null
  mindmap: MindmapPreview | null
}

export interface ChromeOverlay {
  kind: 'hover' | 'selection' | 'guide' | 'marquee' | 'edit' | 'mindmap-drop' | 'draw' | 'custom'
  id?: string
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
  update(input: Input): Result
  subscribe(listener: (snapshot: Snapshot, change: Change) => void): () => void
}

export interface Result {
  snapshot: Snapshot
  change: Change
  trace?: TraceRun
}

export interface Read {
  snapshot(): Snapshot
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined
  scene(): SceneSnapshot
  ui(): UiSnapshot
}
