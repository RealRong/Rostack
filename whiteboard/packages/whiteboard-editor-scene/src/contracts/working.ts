import type {
  GraphDelta,
  SpatialDelta
} from './delta'
import type {
  TextMeasure,
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
  delta: {
    graph: GraphDelta
    spatial: SpatialDelta
  }
}
