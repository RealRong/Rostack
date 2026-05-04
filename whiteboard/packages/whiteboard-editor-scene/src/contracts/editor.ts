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
  EdgePatch,
  Group,
  MindmapDragDropTarget,
  MindmapLayout,
  MindmapRecord,
  Node,
  NodeGeometry,
  NodeModel,
  NodeFieldPatch,
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
import type { WhiteboardChange } from '@whiteboard/engine/mutation'
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
  EditorStateChange
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
  change: WhiteboardChange
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
    change: WhiteboardChange
  }
  editor: {
    snapshot: EditorSnapshot
    change: EditorStateChange
  }
}

export type OwnerRef =
  | {
      kind: 'mindmap'
      id: string
    }
  | {
      kind: 'group'
      id: string
    }

export interface EdgeNodes {
  source?: string
  target?: string
}

export type GroupItemRef =
  | {
      kind: 'node'
      id: string
    }
  | {
      kind: 'edge'
      id: string
    }

export interface EditorStateInput {
  edit: EditSession | null
  preview: PreviewInput
  tool: Tool
}

export type NodePreviewValue = NodePreview
export type NodePreviewRecord = Readonly<Record<string, NodePreview | undefined>>
export type EdgePreviewValue = EdgePreview
export type EdgePreviewRecord = Readonly<Record<string, EdgePreview | undefined>>
export type MindmapPreviewValue = MindmapPreviewEntry
export type MindmapPreview = Readonly<Record<string, MindmapPreviewEntry | undefined>>

export interface PreviewInput {
  node: NodePreviewRecord
  edge: EdgePreviewRecord
  mindmap: MindmapPreview
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
    focusedNodeId?: string
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
  hiddenNodeIds: readonly string[]
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
    nodeId: string
    ghost: Rect
    drop?: MindmapDragDropTarget
  }
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
  touchedNodeIds: ReadonlySet<string>
  touchedEdgeIds: ReadonlySet<string>
  touchedMindmapIds: ReadonlySet<string>
  activeEdgeIds: ReadonlySet<string>
  uiChanged: boolean
  overlayChanged: boolean
  chromeChanged: boolean
}

export interface SelectionState {
  nodeIds: readonly string[]
  edgeIds: readonly string[]
}

export type HoverState =
  | {
      kind: 'none'
    }
  | {
      kind: 'node'
      nodeId: string
    }
  | {
      kind: 'edge'
      edgeId: string
    }
  | {
      kind: 'mindmap'
      mindmapId: string
    }
  | {
      kind: 'group'
      groupId: string
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
      nodeIds: readonly string[]
      edgeIds: readonly string[]
    }
  | {
      kind: 'selection-marquee'
      worldRect: Rect
      match: SelectionMarqueeMatch
    }
  | {
      kind: 'selection-transform'
      nodeIds: readonly string[]
    }
  | {
      kind: 'edge-connect'
      edgeId?: string
      resolution?: ConnectResolution
    }
  | {
      kind: 'edge-move'
      edgeId: string
    }
  | {
      kind: 'edge-label'
      edgeId: string
      labelId: string
    }
  | {
      kind: 'edge-route'
      edgeId: string
    }
  | {
      kind: 'draw'
    }
  | {
      kind: 'mindmap-drag'
      mindmapId: string
      nodeId: string
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
  style: import('@whiteboard/core/types').EdgeLabel['style']
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
  id: string
  rootId: string
  nodeIds: readonly string[]
  tree: MindmapTree
  layout: MindmapLayoutSpec
  computed: MindmapLayout
}

export interface MindmapBaseView {
  mindmap: MindmapRecord
}

export interface MindmapStructureView {
  rootId: string
  nodeIds: readonly string[]
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
      id: string
    }
  | {
      kind: 'node'
      id: string
    }
  | {
      kind: 'edge'
      id: string
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
    node: FamilyReadStore<string, NodeView>
    edge: FamilyReadStore<string, EdgeView>
    mindmap: FamilyReadStore<string, MindmapView>
    group: FamilyReadStore<string, GroupView>
    state: {
      node: FamilyReadStore<string, NodeStateView>
      edge: FamilyReadStore<string, EdgeStateView>
      chrome: store.ReadStore<ChromeStateView>
    }
  }
  render: {
    node: FamilyReadStore<string, NodeRenderView>
    edge: {
      statics: FamilyReadStore<EdgeStaticId, EdgeStaticView>
      active: FamilyReadStore<string, EdgeActiveView>
      labels: FamilyReadStore<EdgeLabelKey, EdgeRenderLabelView>
      masks: FamilyReadStore<string, EdgeMaskView>
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
  node(id: string): Node | undefined
  edge(id: string): Edge | undefined
  group(id: string): Group | undefined
  mindmap(id: string): MindmapRecord | undefined
  nodeIds(): readonly string[]
  edgeIds(): readonly string[]
  groupIds(): readonly string[]
  mindmapIds(): readonly string[]
  order: {
    order(): readonly import('@whiteboard/core/types').CanvasItemRef[]
    slot(ref: import('@whiteboard/core/types').CanvasItemRef): {
      prev?: import('@whiteboard/core/types').CanvasItemRef
      next?: import('@whiteboard/core/types').CanvasItemRef
    } | undefined
    groupRefs(groupId: string): readonly import('@whiteboard/core/types').CanvasItemRef[]
  }
  slice(input: {
    nodeIds?: readonly string[]
    edgeIds?: readonly string[]
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
    touchedNodeIds(): ReadonlySet<string>
    touchedEdgeIds(): ReadonlySet<string>
    touchedMindmapIds(): ReadonlySet<string>
    activeEdgeIds(): ReadonlySet<string>
    uiChanged(): boolean
    overlayChanged(): boolean
    chromeChanged(): boolean
  }
}

export type EdgeChromeView = {
  edgeId: string
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
      id: string
    }
  | {
      kind: 'edge'
      id: string
    }
  | {
      kind: 'mindmap'
      id: string
    }
  | {
      kind: 'group'
      id: string
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
      id: string
    }
  | {
      kind: 'edge'
      id: string
    }
  | {
      kind: 'mindmap'
      id: string
    }
  | {
      kind: 'group'
      id: string
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
  get(id: string): NodeView | undefined
  entries(): IterableIterator<[string, NodeView]>
  idsInRect(rect: Rect, options?: NodeRectHitOptions): readonly string[]
  descendants(nodeIds: readonly string[]): readonly string[]
  relatedEdgeIds(nodeIds: Iterable<string>): readonly string[]
  owner(id: string): OwnerRef | undefined
}

export interface SceneEdges {
  get(id: string): EdgeView | undefined
  edit(id: string): EdgeView | undefined
  entries(): IterableIterator<[string, EdgeView]>
  idsInRect(rect: Rect, options?: {
    match?: 'touch' | 'contain'
  }): readonly string[]
  connectCandidates(rect: Rect): readonly EdgeConnectCandidate[]
  capability(id: string): import('@whiteboard/core/edge').EdgeCapability | undefined
  routePoints(input: {
    edgeId: string
    activeRouteIndex?: number
  }): readonly import('@whiteboard/core/edge').EdgeRoutePoint[]
  box(id: string): import('@whiteboard/core/edge').EdgeBox | undefined
  chrome(input: {
    edgeId: string
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
  get(id: string): MindmapView | undefined
  tree(value: string): SceneMindmapTree | undefined
  entries(): IterableIterator<[string, MindmapView]>
  id(value: string): string | undefined
  structure(value: string): MindmapView['structure'] | undefined
  ofNodes(nodeIds: readonly string[]): string | undefined
  addChildTargets(input: {
    mindmapId: string
    selection: SelectionTarget
    edit: EditSession | null
  }): readonly {
    targetNodeId: string
    x: number
    y: number
    placement: 'left' | 'right'
  }[]
  navigate(input: {
    id: string
    fromNodeId: string
    direction: 'parent' | 'first-child' | 'prev-sibling' | 'next-sibling'
  }): string | undefined
}

export interface SceneGroups {
  get(id: string): GroupView | undefined
  entries(): IterableIterator<[string, GroupView]>
  ofNode(nodeId: string): string | undefined
  ofEdge(edgeId: string): string | undefined
  target(groupId: string): SelectionTarget | undefined
  exact(target: SelectionTarget): readonly string[]
}

export interface SceneSelection {
  members(target: SelectionTarget): SelectionMembersView
  summary(target: SelectionTarget): SelectionSummary
  affordance(target: SelectionTarget): SelectionAffordance
  selected: {
    node(target: SelectionTarget, nodeId: string): boolean
    edge(target: SelectionTarget, edgeId: string): boolean
  }
  move(target: SelectionTarget): {
    nodes: readonly Node[]
    edges: readonly Edge[]
  }
  bounds(target: SelectionTarget): Rect | undefined
}

export interface SceneFrame {
  point(point: Point): readonly string[]
  rect(rect: Rect): readonly string[]
  pick(point: Point, options?: {
    excludeIds?: readonly string[]
  }): string | undefined
  parent(nodeId: string, options?: {
    excludeIds?: readonly string[]
  }): string | undefined
}

export interface SceneVisibility {
  point(input: {
    point: Point
    threshold?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap')[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
    }>
  }): {
    ordered: readonly SceneHitItem[]
    topmost?: SceneHitItem
  }
  rect(input: {
    rect: Rect
    kinds?: readonly ('node' | 'edge' | 'mindmap')[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
    }>
  }): {
    ordered: readonly SceneHitItem[]
    visibleIds: {
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
    }
  }
}

export interface SceneHit {
  node(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly string[]
  }): string | undefined
  edge(input: {
    point: Point
    threshold?: number
    excludeIds?: readonly string[]
  }): string | undefined
  item(input: {
    point: Point
    threshold?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
      group: readonly string[]
    }>
  }): SceneHitItem | undefined
}

export interface ProjectionViewRead {
  zoom(): number
  center(): Point
  worldRect(): Rect
  screenPoint(point: Point): Point
  screenRect(rect: Rect): Rect
  visible(
    options?: Parameters<SpatialRead['rect']>[1]
  ): ReturnType<SpatialRead['rect']>
  pick(input: {
    point: Point
    radius?: number
    kinds?: readonly ('node' | 'edge' | 'mindmap' | 'group')[]
    exclude?: Partial<{
      node: readonly string[]
      edge: readonly string[]
      mindmap: readonly string[]
      group: readonly string[]
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
  visibility: SceneVisibility
  hit: SceneHit
  overlay: SceneOverlay
  spatial: SceneSpatial
  snap: SceneSnap
  items(): State['items']
  bounds(): Rect | undefined
}
