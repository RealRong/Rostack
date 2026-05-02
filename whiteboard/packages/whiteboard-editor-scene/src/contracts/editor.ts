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
  MindmapLayoutSpec,
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
  Group,
  GroupId,
  MindmapDragDropTarget,
  MindmapId,
  MindmapLayout,
  MindmapRecord,
  Node,
  NodeGeometry,
  NodeModel,
  NodeFieldPatch,
  NodeId,
  Point,
  Rect,
  Size,
  Viewport
} from '@whiteboard/core/types'
import type {
  ProjectionTrace,
  Revision
} from '@shared/projection'
import { store } from '@shared/core'
import type { WhiteboardMutationDelta } from '@whiteboard/engine/mutation'
import type {
  DrawState
} from '@whiteboard/editor/schema/draw-state'
import type {
  EditCaret,
  EditField,
  EditSession
} from '@whiteboard/editor/schema/edit'
import type {
  EditorStateDocument as EditorSnapshot
} from '@whiteboard/editor/state/document'
import type {
  EditorStateMutationDelta
} from '@whiteboard/editor/state/runtime'
import type {
  InteractionMode
} from '@whiteboard/editor/input/core/types'
import type {
  Tool
} from '@whiteboard/editor/schema/tool'
import type { Capture } from './capture'
import type { IdDelta, SceneItemKey } from './delta'
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
  document: SceneUpdateInput['document']
  editor: SceneUpdateInput['editor']
  delta: WhiteboardMutationDelta
}

export interface SceneViewSnapshot {
  zoom: number
  center: Point
  worldRect: Rect
}

export type SceneViewInput = () => SceneViewSnapshot

export interface EditorInteractionState {
  mode: InteractionMode
  chrome: boolean
  space: boolean
  hover: HoverState
}

export interface SceneUpdateInput {
  document: {
    snapshot: WhiteboardDocument
    rev: Revision
    delta: WhiteboardMutationDelta
  }
  editor: {
    snapshot: EditorSnapshot
    delta: EditorStateMutationDelta
  }
}

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

export interface EditorStateInput {
  edit: EditSession | null
  preview: PreviewInput
  tool: Tool
}

export interface PreviewInput {
  node: Readonly<Record<NodeId, NodePreview | undefined>>
  edge: Readonly<Record<EdgeId, EdgePreview | undefined>>
  mindmap: Readonly<Record<MindmapId, MindmapPreviewEntry | undefined>>
  selection: SelectionPreview
  draw: DrawPreview | null
  edgeGuide?: EdgeGuidePreview
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

export interface MindmapPreviewEntry {
  rootMove?: {
    delta: Point
  }
  subtreeMove?: {
    nodeId: NodeId
    ghost: Rect
    drop?: MindmapDragDropTarget
  }
}

export type MindmapPreview = Readonly<Record<MindmapId, MindmapPreviewEntry | undefined>>

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

export interface SceneMindmapTree {
  id: MindmapId
  rootId: NodeId
  nodeIds: readonly NodeId[]
  tree: MindmapTree
  layout: MindmapLayoutSpec
  computed: MindmapLayout
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
  mindmap: MindmapPreview
}

export interface ChromeOverlay {
  kind: 'hover' | 'selection' | 'guide' | 'marquee' | 'edit' | 'mindmap-drop' | 'draw' | 'custom'
  id?: string
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

export interface DocumentFrame {
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
  order: {
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

export interface RuntimeFrame {
  editor: {
    tool(): Tool
    draw(): DrawState
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

export type EdgeChromeView = {
  edgeId: EdgeId
  ends: ResolvedEdgeEnds
  canReconnectSource: boolean
  canReconnectTarget: boolean
  canEditRoute: boolean
  showEditHandles: boolean
  routePoints: readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
}

export type SceneHitItem =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'group'
      id: GroupId
    }

export type SceneViewportPick = {
  rect: Rect
  target?: SceneHitItem
  stats: {
    cells: number
    candidates: number
    oversized: number
    hits: number
    latency: number
  }
}

export type ScenePickRequest = {
  client: Point
  screen: Point
  world: Point
  radius?: number
  kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
}

export type ScenePickTarget =
  | {
      kind: 'node'
      id: NodeId
    }
  | {
      kind: 'edge'
      id: EdgeId
    }
  | {
      kind: 'mindmap'
      id: MindmapId
    }
  | {
      kind: 'group'
      id: GroupId
    }

export type ScenePickResult = {
  rect: Rect
  target?: ScenePickTarget
  stats: SceneViewportPick['stats']
}

export type ScenePickRuntimeResult = {
  request: ScenePickRequest
  result: ScenePickResult
}

export type ScenePickRuntime = {
  schedule: (request: ScenePickRequest) => void
  get: () => ScenePickRuntimeResult | undefined
  subscribe: (listener: () => void) => store.Unsubscribe
  clear: () => void
  dispose: () => void
}

export interface SceneNodes {
  get(id: NodeId): NodeView | undefined
  entries(): IterableIterator<[NodeId, NodeView]>
  idsInRect(rect: Rect, options?: NodeRectHitOptions): readonly NodeId[]
  descendants(nodeIds: readonly NodeId[]): readonly NodeId[]
  relatedEdgeIds(nodeIds: Iterable<NodeId>): readonly EdgeId[]
  owner(id: NodeId): OwnerRef | undefined
}

export interface SceneEdges {
  get(id: EdgeId): EdgeView | undefined
  edit(id: EdgeId): EdgeView | undefined
  entries(): IterableIterator<[EdgeId, EdgeView]>
  idsInRect(rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }): readonly EdgeId[]
  connectCandidates(rect: Rect): readonly EdgeConnectCandidate[]
  capability(id: EdgeId): import('@whiteboard/core/edge').EdgeCapability | undefined
  routePoints(input: {
    edgeId: EdgeId
    activeRouteIndex?: number
  }): readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
  box(id: EdgeId): import('@whiteboard/core/edge').EdgeBox | undefined
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
  }): EdgeChromeView | undefined
}

export interface SceneMindmaps {
  get(id: MindmapId): MindmapView | undefined
  tree(value: MindmapId | NodeId | string): SceneMindmapTree | undefined
  entries(): IterableIterator<[MindmapId, MindmapView]>
  id(value: MindmapId | NodeId | string): MindmapId | undefined
  structure(value: MindmapId | NodeId | string): MindmapView['structure'] | undefined
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

export interface SceneGroups {
  get(id: GroupId): GroupView | undefined
  entries(): IterableIterator<[GroupId, GroupView]>
  ofNode(nodeId: NodeId): GroupId | undefined
  ofEdge(edgeId: EdgeId): GroupId | undefined
  target(groupId: GroupId): SelectionTarget | undefined
  exact(target: SelectionTarget): readonly GroupId[]
}

export interface SceneSelection {
  members(target: SelectionTarget): SelectionMembersView
  summary(target: SelectionTarget): SelectionSummary
  affordance(target: SelectionTarget): SelectionAffordance
  selected: {
    node(target: SelectionTarget, nodeId: NodeId): boolean
    edge(target: SelectionTarget, edgeId: EdgeId): boolean
  }
  move(target: SelectionTarget): {
    nodes: readonly Node[]
    edges: readonly Edge[]
  }
  bounds(target: SelectionTarget): Rect | undefined
}

export interface SceneFrame {
  point(point: Point): readonly NodeId[]
  rect(rect: Rect): readonly NodeId[]
  pick(point: Point, options?: {
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
  parent(nodeId: NodeId, options?: {
    excludeIds?: readonly NodeId[]
  }): NodeId | undefined
}

export interface SceneHit {
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
  }): SceneHitItem | undefined
}

export interface SceneViewport {
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
  }): SceneViewportPick
}

export interface SceneOverlay {
  marquee(): {
    rect: Rect
    match: SelectionMarqueeMatch
  } | undefined
  draw(): DrawPreview | null
  guides(): readonly Guide[]
  edgeGuide(): EdgeGuidePreview | undefined
}

export interface SceneSnap {
  candidates(rect: Rect): readonly import('@whiteboard/core/node').SnapCandidate[]
}

export interface SceneSpatial extends SpatialRead {}

export interface EditorScene {
  revision(): Revision
  stores: RuntimeStores
  pick: ScenePickRuntime
  document: DocumentFrame
  runtime: RuntimeFrame
  nodes: SceneNodes
  edges: SceneEdges
  mindmaps: SceneMindmaps
  groups: SceneGroups
  selection: SceneSelection
  frame: SceneFrame
  hit: SceneHit
  overlay: SceneOverlay
  spatial: SceneSpatial
  snap: SceneSnap
  items(): State['items']
  bounds(): Rect | undefined
}
