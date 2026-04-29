import type {
  EditorScenePlan
} from './plan'
import type {
  DeltaState,
  DocumentDelta,
  GraphDelta,
  GraphPhaseDelta,
  RenderDelta,
  SpatialDelta,
  RenderPhaseDelta,
  UiPhaseDelta
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
  plan: EditorScenePlan
  draft: {
    node: Map<NodeId, NodeDraftMeasure>
  }
  delta: DeltaState
  phase: {
    graph: GraphPhaseDelta
    ui: UiPhaseDelta
    render: RenderPhaseDelta
    spatial: SpatialDelta
  }
}
