import type { SliceExportResult } from '@whiteboard/core/document'
import type {
  ConnectResolution,
  EdgeConnectCandidate,
  EdgeLabelMaskRect,
  ResolvedEdgeEnds
} from '@whiteboard/core/edge'
import type {
  EdgeHandle,
  EdgePathSegment
} from '@whiteboard/core/types/edge'
import type {
  Guide,
  NodeRectHitOptions,
  TransformPreviewPatch
} from '@whiteboard/core/node'
import type {
  NodeDraftMeasure as CoreNodeDraftMeasure,
  WhiteboardLayoutService
} from '@whiteboard/core/layout'
import type {
  MindmapRenderConnector,
  MindmapStructure,
  MindmapTree
} from '@whiteboard/core/mindmap'
import type {
  SelectionAffordance,
  SelectionSummary,
  SelectionTarget
} from '@whiteboard/core/selection'
import type {
  Document as WhiteboardDocument,
  Edge,
  EdgeLabel,
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
  Node,
  NodeGeometry,
  NodeModel,
  NodeFieldPatch,
  NodeId,
  NodeTemplate,
  Point,
  Rect,
  Size
} from '@whiteboard/core/types'
import type {
  ProjectionTrace,
  Revision
} from '@shared/projection'
import { store } from '@shared/core'
import type { WhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type { Capture } from './capture'
import type { IdDelta, SceneItemKey } from './delta'
import type { EditorSceneRuntimeDelta } from './plan'
import type {
  EdgeActiveView,
  ChromeRenderView,
  EdgeLabelKey,
  EdgeLabelView as EdgeRenderLabelView,
  EdgeMaskView,
  NodeRenderView,
  EdgeOverlayView,
  EdgeStaticId,
  EdgeStaticView
} from './render'

export type NodeDraftMeasure = CoreNodeDraftMeasure
import type { SpatialRead } from './spatial'
import type { State } from './state'

export interface Input {
  document: {
    rev: Revision
    doc: WhiteboardDocument
  }
  runtime: {
    session: SessionInput
    interaction: InteractionInput
    view: SceneViewSnapshot
    facts: SceneRuntimeFacts
    delta: EditorSceneRuntimeDelta
  }
  delta: WhiteboardMutationDelta
}

export interface SceneViewSnapshot {
  zoom: number
  center: Point
  worldRect: Rect
}

export type SceneViewInput = () => SceneViewSnapshot

export type SceneBackgroundView =
  | {
      type: 'none'
    }
  | {
      type: 'dot' | 'line'
      color: string
      step: number
      offset: Point
    }

export type OwnerRef =
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'group'
      id: GroupId
    }

export interface EdgeNodes {
  source?: NodeId
  target?: NodeId
}

export type GroupItemRef =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
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
  edges: ReadonlyMap<EdgeId, EdgeDraft>
}

export interface EdgeDraft {
  patch?: EdgePatch
  activeRouteIndex?: number
}

export interface PreviewInput {
  nodes: ReadonlyMap<NodeId, NodePreview>
  edges: ReadonlyMap<EdgeId, EdgePreview>
  edgeGuide?: EdgeGuidePreview
  draw: DrawPreview | null
  selection: SelectionPreview
  mindmap: MindmapPreview | null
}

export interface EdgeGuidePreview {
  path?: {
    svgPath: string
    style?: Edge['style']
  }
  connect?: {
    focusedNodeId?: NodeId
    resolution: ConnectResolution
  }
}

export type NodePreviewPatch = Omit<TransformPreviewPatch, 'id'>

export interface NodePresentation {
  position?: Point
}

export interface NodePreview {
  patch?: NodePreviewPatch
  presentation?: NodePresentation
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

export type EditorSceneLayout = WhiteboardLayoutService

export interface NodeCapabilityInput {
  meta(type: string): {
    key?: string
    name: string
    family: string
    icon: string
  }
  edit(type: string, field: string): {
    multiline?: boolean
  } | undefined
  capability(node: NodeModel): {
    role: import('@whiteboard/core/types').NodeRole
    resize: boolean
    rotate: boolean
    connect: boolean
  }
}

export interface SelectionMembersView {
  target: SelectionTarget
  key: string
  nodes: readonly NodeModel[]
  edges: readonly Edge[]
  primaryNode?: NodeModel
  primaryEdge?: Edge
}

export interface InteractionInput {
  selection: SelectionState
  hover: HoverState
  drag: DragState
  chrome: boolean
  editingEdge: boolean
}

export interface SceneRuntimeFacts {
  touchedNodeIds: ReadonlySet<NodeId>
  touchedEdgeIds: ReadonlySet<EdgeId>
  touchedMindmapIds: ReadonlySet<MindmapId>
  activeEdgeIds: ReadonlySet<EdgeId>
  uiChanged: boolean
  overlayChanged: boolean
  chromeChanged: boolean
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

export interface NodeView {
  base: NodeBaseView
  geometry: NodeGeometryView
}

export interface NodeBaseView {
  node: NodeModel
  owner?: OwnerRef
}

export interface NodeGeometryView {
  rotation: number
  rect: Rect
  bounds: Rect
  outline: NodeGeometry
}

export interface EdgeView {
  base: EdgeBaseView
  route: EdgeRouteView
  box?: EdgeBoxView
}

export interface EdgeBaseView {
  edge: Edge
  nodes: EdgeNodes
}

export interface EdgeRouteView {
  points: readonly Point[]
  segments: readonly EdgePathSegment[]
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
  size: Size
  point: Point
  angle: number
  rect: Rect
  maskRect: EdgeLabelMaskRect
}

export interface EdgeBoxView {
  rect: Rect
  pad: number
}

export interface NodeUiView {
  hidden: boolean
  selected: boolean
  hovered: boolean
  editing: boolean
  patched: boolean
  resizing: boolean
  edit?: NodeUiEdit
}

export interface NodeUiEdit {
  field: EditField
  caret: EditCaret
}

export interface EdgeUiView {
  selected: boolean
  patched: boolean
  activeRouteIndex?: number
  editingLabelId?: string
  labels: ReadonlyMap<string, EdgeLabelUiView>
}

export interface EdgeLabelUiView {
  editing: boolean
  caret?: EditCaret
}

export type NodeStateView = NodeUiView
export type EdgeStateView = EdgeUiView
export type ChromeStateView = ChromeView

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
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapTree
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
  items: readonly GroupItemRef[]
}

export interface GroupFrameView {
  bounds?: Rect
}

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

export interface ChromeView {
  overlays: readonly ChromeOverlay[]
  hover: HoverState
  preview: ChromePreviewView
  edit: EditSession | null
}

export interface ChromePreviewView {
  edgeGuide?: EdgeGuidePreview
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

export interface Runtime {
  readonly stores: RuntimeStores
  readonly query: Query
  revision(): Revision
  state(): State
  capture(): Capture
  update(input: Input): Result
  subscribe(listener: (result: Result) => void): () => void
}

export interface FamilyReadStore<
  TId extends string,
  TValue
> {
  ids: store.ReadStore<readonly TId[]>
  byId: store.KeyedReadStore<TId, TValue | undefined>
}

export interface RuntimeStores {
  document: {
    revision: store.ReadStore<Revision>
    background: store.ReadStore<WhiteboardDocument['background'] | undefined>
  }
  graph: {
    node: FamilyReadStore<NodeId, NodeView>
    edge: FamilyReadStore<EdgeId, EdgeView>
    mindmap: FamilyReadStore<MindmapId, MindmapView>
    group: FamilyReadStore<GroupId, GroupView>
    state: {
      node: FamilyReadStore<NodeId, NodeStateView>
      edge: FamilyReadStore<EdgeId, EdgeStateView>
      chrome: store.ReadStore<ChromeStateView>
    }
  }
  render: {
    node: FamilyReadStore<NodeId, NodeRenderView>
    edge: {
      statics: FamilyReadStore<EdgeStaticId, EdgeStaticView>
      active: FamilyReadStore<EdgeId, EdgeActiveView>
      labels: FamilyReadStore<EdgeLabelKey, EdgeRenderLabelView>
      masks: FamilyReadStore<EdgeId, EdgeMaskView>
    }
    chrome: {
      scene: store.ReadStore<ChromeRenderView>
      edge: store.ReadStore<EdgeOverlayView>
    }
  }
  items: FamilyReadStore<SceneItemKey, SceneItem>
}

export interface Result {
  revision: Revision
  trace?: ProjectionTrace
}

export interface DocumentQuery {
  snapshot(): WhiteboardDocument
  background(): WhiteboardDocument['background'] | undefined
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  group(id: GroupId): Group | undefined
  mindmap(id: MindmapId): MindmapRecord | undefined
  nodeIds(): readonly NodeId[]
  edgeIds(): readonly EdgeId[]
  groupIds(): readonly GroupId[]
  mindmapIds(): readonly MindmapId[]
  canvas: {
    order(): readonly import('@whiteboard/core/types').CanvasItemRef[]
    slot(ref: import('@whiteboard/core/types').CanvasItemRef): {
      prev?: import('@whiteboard/core/types').CanvasItemRef
      next?: import('@whiteboard/core/types').CanvasItemRef
    } | undefined
    groupRefs(groupId: GroupId): readonly import('@whiteboard/core/types').CanvasItemRef[]
  }
  slice(input: {
    nodeIds?: readonly NodeId[]
    edgeIds?: readonly EdgeId[]
  }): SliceExportResult | undefined
}

export interface RuntimeQuery {
  session: {
    tool(): ToolState
    selection(): SelectionTarget
    hover(): HoverState
    edit(): EditSession | null
    interaction(): InteractionInput
    preview(): PreviewInput
  }
  facts: {
    touchedNodeIds(): ReadonlySet<NodeId>
    touchedEdgeIds(): ReadonlySet<EdgeId>
    touchedMindmapIds(): ReadonlySet<MindmapId>
    activeEdgeIds(): ReadonlySet<EdgeId>
    uiChanged(): boolean
    overlayChanged(): boolean
    chromeChanged(): boolean
  }
}

export interface SceneQuery {
  relatedEdgeIds(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  descendants(nodeIds: readonly NodeId[]): readonly NodeId[]
  mindmapStructure(value: MindmapId | NodeId | string): MindmapView['structure'] | undefined
  ownerByNode(nodeId: NodeId): OwnerRef | undefined
  spatial: SpatialRead
  snap(rect: Rect): readonly import('@whiteboard/core/node').SnapCandidate[]
  bounds(): Rect | undefined
  node: {
    idsInRect(rect: Rect, options?: NodeRectHitOptions): readonly NodeId[]
  }
  edge: {
    idsInRect(rect: Rect, options?: {
      match?: 'touch' | 'contain'
    }): readonly EdgeId[]
    connectCandidates(rect: Rect): readonly EdgeConnectCandidate[]
    capability(edgeId: EdgeId): import('@whiteboard/core/edge').EdgeCapability | undefined
    editable(edgeId: EdgeId): EdgeView | undefined
    routePoints(input: {
      edgeId: EdgeId
      activeRouteIndex?: number
    }): readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
    box(edgeId: EdgeId): import('@whiteboard/core/edge').EdgeBox | undefined
    chrome(input: {
      edgeId: EdgeId
      activeRouteIndex?: number
      tool: {
        type: string
      }
      interaction: {
        chrome: boolean
        editingEdge: boolean
      }
      edit: EditSession | null
    }): {
      edgeId: EdgeId
      ends: ResolvedEdgeEnds
      canReconnectSource: boolean
      canReconnectTarget: boolean
      canEditRoute: boolean
      showEditHandles: boolean
      routePoints: readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
    } | undefined
  }
  selection: {
    members(target: SelectionTarget): SelectionMembersView
    summary(target: SelectionTarget): SelectionSummary
    affordance(target: SelectionTarget): SelectionAffordance
    selected: {
      node(target: SelectionTarget, nodeId: NodeId): boolean
      edge(target: SelectionTarget, edgeId: EdgeId): boolean
    }
    move(target: import('@whiteboard/core/selection').SelectionTarget): {
      nodes: readonly Node[]
      edges: readonly Edge[]
    }
    bounds(target: import('@whiteboard/core/selection').SelectionTarget): Rect | undefined
  }
  overlay: {
    marquee(): {
      rect: Rect
      match: SelectionMarqueeMatch
    } | undefined
    draw(): DrawPreview | null
    guides(): readonly Guide[]
    edgeGuide(): EdgeGuidePreview | undefined
  }
  mindmap: {
    resolve(value: string): MindmapId | undefined
    structure(value: MindmapId | NodeId): MindmapView['structure'] | undefined
    ofNodes(nodeIds: readonly NodeId[]): MindmapId | undefined
    addChildTargets(input: {
      mindmapId: MindmapId
      selection: SelectionTarget
      edit: EditSession | null
    }): readonly {
      targetNodeId: NodeId
      x: number
      y: number
      placement: 'left' | 'right'
    }[]
    navigate(input: {
      id: MindmapId
      fromNodeId: NodeId
      direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
    }): NodeId | undefined
  }
  group: {
    ofNode(nodeId: NodeId): GroupId | undefined
    ofEdge(edgeId: EdgeId): GroupId | undefined
    target(targetId: GroupId): import('@whiteboard/core/selection').SelectionTarget | undefined
    exact(target: import('@whiteboard/core/selection').SelectionTarget): readonly GroupId[]
  }
  frame: {
    point(point: Point): readonly NodeId[]
    rect(rect: Rect): readonly NodeId[]
    pick(point: Point, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    parent(nodeId: NodeId, options?: {
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
  }
  hit: {
    node(input: {
      point: Point
      threshold?: number
      excludeIds?: readonly NodeId[]
    }): NodeId | undefined
    edge(input: {
      point: Point
      threshold?: number
      excludeIds?: readonly EdgeId[]
    }): EdgeId | undefined
    item(input: {
      point: Point
      threshold?: number
      kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
      exclude?: Partial<{
        node: readonly NodeId[]
        edge: readonly EdgeId[]
        mindmap: readonly MindmapId[]
        group: readonly GroupId[]
      }>
    }): {
      kind: 'node'
      id: NodeId
    } | {
      kind: 'edge'
      id: EdgeId
    } | {
      kind: 'mindmap'
      id: MindmapId
    } | {
      kind: 'group'
      id: GroupId
    } | undefined
  }
  viewport: {
    zoom(): number
    center(): Point
    worldRect(): Rect
    screenPoint(point: Point): Point
    screenRect(rect: Rect): Rect
    background(): SceneBackgroundView
    visible(
      options?: Parameters<SpatialRead['rect']>[1]
    ): ReturnType<SpatialRead['rect']>
    pick(input: {
      point: Point
      radius?: number
      kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
      exclude?: Partial<{
        node: readonly NodeId[]
        edge: readonly EdgeId[]
        mindmap: readonly MindmapId[]
        group: readonly GroupId[]
      }>
    }): {
      rect: Rect
      target?: {
        kind: 'node'
        id: NodeId
      } | {
        kind: 'edge'
        id: EdgeId
      } | {
        kind: 'mindmap'
        id: MindmapId
      } | {
        kind: 'group'
        id: GroupId
      }
      stats: {
        cells: number
        candidates: number
        oversized: number
        hits: number
        latency: number
      }
    }
  }
  items(): State['items']
}

export interface SceneProjectionQuery {
  node(id: NodeId): NodeView | undefined
  edge(id: EdgeId): EdgeView | undefined
  mindmap(id: MindmapId): MindmapView | undefined
  group(id: GroupId): GroupView | undefined
  nodes(): IterableIterator<[NodeId, NodeView]>
  edges(): IterableIterator<[EdgeId, EdgeView]>
  mindmaps(): IterableIterator<[MindmapId, MindmapView]>
  groups(): IterableIterator<[GroupId, GroupView]>
  query: SceneQuery
}

export interface Query {
  revision(): Revision
  document: DocumentQuery
  runtime: RuntimeQuery
  scene: SceneProjectionQuery
}
