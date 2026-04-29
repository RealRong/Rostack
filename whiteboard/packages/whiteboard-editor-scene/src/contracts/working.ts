import type {
  WhiteboardExecution
} from './execution'
import type {
  DocumentDelta,
  GraphDelta,
  ItemsDelta,
  RenderDelta,
  SpatialDelta,
  UiDelta
} from './delta'
import type { NodeId } from '@whiteboard/core/types'
import type {
  EditorSceneLayout,
  NodeDraftMeasure,
} from './editor'
import type { State } from './state'

export type {
  GraphState,
  GraphGroupEntry,
  GraphMindmapEntry,
  GraphNodeEntry,
  GraphEdgeEntry,
  IndexState,
  RenderState,
  State,
  UiState
} from './state'

export interface WorkingState extends State {
  layout?: EditorSceneLayout
  execution: WhiteboardExecution
  draft: {
    node: Map<NodeId, NodeDraftMeasure>
  }
  delta: {
    document: DocumentDelta
    graph: GraphDelta
    spatial: SpatialDelta
    items: ItemsDelta
    ui: UiDelta
    render: RenderDelta
  }
}
