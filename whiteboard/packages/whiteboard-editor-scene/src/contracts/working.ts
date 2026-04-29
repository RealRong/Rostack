import type {
  GraphDelta,
  GraphDirty,
  ItemsDelta,
  RenderDelta,
  SpatialDelta,
  UiDelta
} from './delta'
import type { NodeId } from '@whiteboard/core/types'
import type {
  TextMeasure,
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
  measure?: TextMeasure
  draft: {
    node: Map<NodeId, NodeDraftMeasure>
  }
  dirty: {
    graph: GraphDirty
  }
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
    items: ItemsDelta
    ui: UiDelta
    render: RenderDelta
  }
}
