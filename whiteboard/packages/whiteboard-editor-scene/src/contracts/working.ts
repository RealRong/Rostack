import type {
  WhiteboardSceneExecution
} from './execution'
import type {
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
  execution: WhiteboardSceneExecution
  draft: {
    node: Map<NodeId, NodeDraftMeasure>
  }
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
    items: ItemsDelta
    ui: UiDelta
    render: RenderDelta
  }
}
