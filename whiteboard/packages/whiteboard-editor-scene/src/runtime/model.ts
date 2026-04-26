import {
  createPlan,
  defineProjectionModel,
  family,
  type ProjectionPhase,
  type ProjectionScopeInputValue,
  type ProjectionScopeValue,
  type Revision,
  value
} from '@shared/projection'
import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeModel,
  NodeId
} from '@whiteboard/core/types'
import type {
  HoverState,
  Input,
  NodeCapabilityInput,
  OwnerRef,
  SceneViewInput,
  TextMeasure
} from '../contracts/editor'
import type { Capture } from '../contracts/capture'
import type {
  EditorPhaseScopeMap,
  GraphDelta,
  GraphPatchScope,
  SpatialPatchScope,
  ViewPatchScope
} from '../contracts/delta'
import {
  graphPhaseScope,
  spatialPhaseScope,
  viewPhaseScope
} from '../contracts/delta'
import type {
  WorkingState
} from '../contracts/working'
import type {
  EdgeActiveView,
  EdgeLabelKey,
  EdgeStaticId,
  EdgeStaticView
} from '../contracts/render'
import { patchGraphState } from '../model/graph/patch'
import { patchDocumentState } from '../model/document/patch'
import { patchViewState } from '../model/view/patch'
import { patchSpatial } from '../model/spatial/update'
import { createEditorSceneRead } from './read'
import { buildEditorSceneCapture } from './capture'
import { createWorking } from './state'

export type EditorScenePhaseName = keyof EditorPhaseScopeMap & string

type GraphScopeInput =
  NonNullable<ProjectionScopeInputValue<EditorPhaseScopeMap['graph']>>

type ViewScopeInput =
  NonNullable<ProjectionScopeInputValue<EditorPhaseScopeMap['view']>>

const appendIds = <TId extends string>(
  target: Set<TId>,
  ids: Iterable<TId>
) => {
  for (const id of ids) {
    target.add(id)
  }
}

const appendMindmapNodeIds = (input: {
  target: Set<NodeId>
  mindmapIds: Iterable<MindmapId>
  readNodeIds: (mindmapId: MindmapId) => readonly NodeId[] | undefined
}) => {
  for (const mindmapId of input.mindmapIds) {
    input.readNodeIds(mindmapId)?.forEach((nodeId) => {
      input.target.add(nodeId)
    })
  }
}

const readHoveredNodeId = (
  hover: HoverState
): NodeId | undefined => hover.kind === 'node'
  ? hover.nodeId
  : undefined

const readHoveredEdgeId = (
  hover: HoverState
): EdgeId | undefined => hover.kind === 'edge'
  ? hover.edgeId
  : undefined

const readEditingEdgeId = (
  edit: Input['session']['edit'] | WorkingState['ui']['chrome']['edit']
): EdgeId | undefined => edit?.kind === 'edge-label'
  ? edit.edgeId
  : undefined

const readEditingNodeId = (
  edit: Input['session']['edit'] | WorkingState['ui']['chrome']['edit']
): NodeId | undefined => edit?.kind === 'node'
  ? edit.nodeId
  : undefined

const collectSelectedNodeIds = (
  state: WorkingState
): ReadonlySet<NodeId> => {
  const ids = new Set<NodeId>()
  state.ui.nodes.forEach((view, nodeId) => {
    if (view.selected) {
      ids.add(nodeId)
    }
  })
  return ids
}

const collectSelectedEdgeIds = (
  state: WorkingState
): ReadonlySet<EdgeId> => {
  const ids = new Set<EdgeId>()
  state.ui.edges.forEach((view, edgeId) => {
    if (view.selected) {
      ids.add(edgeId)
    }
  })
  return ids
}

const hasSelection = (
  state: WorkingState
): boolean => {
  for (const view of state.ui.nodes.values()) {
    if (view.selected) {
      return true
    }
  }
  for (const view of state.ui.edges.values()) {
    if (view.selected) {
      return true
    }
  }
  return false
}

const readGraphPlanScope = (
  input: Input
): GraphScopeInput => {
  if (input.delta.document.reset) {
    return {
      reset: true,
      order: true
    }
  }

  const { delta } = input
  const nodes = new Set<NodeId>()
  const edges = new Set<EdgeId>()
  const mindmaps = new Set<MindmapId>()
  const groups = new Set<GroupId>()

  appendIds(nodes, idDelta.touched(delta.document.nodes))
  appendIds(edges, idDelta.touched(delta.document.edges))
  appendIds(mindmaps, idDelta.touched(delta.document.mindmaps))
  appendIds(groups, idDelta.touched(delta.document.groups))

  appendIds(edges, idDelta.touched(delta.session.draft.edges))
  appendIds(nodes, idDelta.touched(delta.session.preview.nodes))
  appendIds(edges, idDelta.touched(delta.session.preview.edges))
  appendIds(mindmaps, idDelta.touched(delta.session.preview.mindmaps))
  appendIds(mindmaps, delta.clock.mindmaps)

  appendIds(edges, input.session.draft.edges.keys())
  appendIds(nodes, input.session.preview.nodes.keys())
  appendIds(edges, input.session.preview.edges.keys())

  if (input.session.edit?.kind === 'node') {
    nodes.add(input.session.edit.nodeId)
  }
  if (input.session.edit?.kind === 'edge-label') {
    edges.add(input.session.edit.edgeId)
  }

  if (input.session.preview.mindmap?.rootMove) {
    mindmaps.add(input.session.preview.mindmap.rootMove.mindmapId)
  }
  if (input.session.preview.mindmap?.subtreeMove) {
    mindmaps.add(input.session.preview.mindmap.subtreeMove.mindmapId)
  }
  input.session.preview.mindmap?.enter?.forEach((entry) => {
    mindmaps.add(entry.mindmapId)
  })

  return {
    order: delta.document.order,
    nodes,
    edges,
    mindmaps,
    groups
  }
}

const hasGraphPlanScope = (
  scope: GraphScopeInput
): boolean => Boolean(
  scope.reset
  || scope.order
  || (scope.nodes instanceof Set && scope.nodes.size > 0)
  || (scope.edges instanceof Set && scope.edges.size > 0)
  || (scope.mindmaps instanceof Set && scope.mindmaps.size > 0)
  || (scope.groups instanceof Set && scope.groups.size > 0)
)

const readItemsChangedFromGraphDelta = (
  graph: GraphDelta
): boolean => (
  graph.order
  || graph.entities.nodes.added.size > 0
  || graph.entities.nodes.removed.size > 0
  || graph.entities.edges.added.size > 0
  || graph.entities.edges.removed.size > 0
  || graph.entities.mindmaps.added.size > 0
  || graph.entities.mindmaps.removed.size > 0
)

const readViewPatchScope = (input: {
  reset?: boolean
  current: Input
  state: WorkingState
  graphDelta?: GraphDelta
  readAllEdgeIds: () => Iterable<EdgeId>
  readMindmapNodeIds: (mindmapId: MindmapId) => readonly NodeId[] | undefined
}): ViewScopeInput => {
  const nodes = new Set<NodeId>()
  const edges = new Set<EdgeId>()
  const statics = new Set<EdgeId>()
  const labels = new Set<EdgeId>()
  const active = new Set<EdgeId>()
  const masks = new Set<EdgeId>()
  let chrome = false
  let items = false
  let overlay = false

  if (input.graphDelta) {
    appendIds(nodes, idDelta.touched(input.graphDelta.entities.nodes))
    appendIds(edges, idDelta.touched(input.graphDelta.entities.edges))
    appendMindmapNodeIds({
      target: nodes,
      mindmapIds: idDelta.touched(input.graphDelta.entities.mindmaps),
      readNodeIds: input.readMindmapNodeIds
    })

    const touchedEdges = input.graphDelta.order
      ? new Set(input.readAllEdgeIds())
      : new Set(idDelta.touched(input.graphDelta.entities.edges))
    appendIds(statics, touchedEdges)
    appendIds(labels, touchedEdges)
    appendIds(active, touchedEdges)
    appendIds(masks, touchedEdges)
    overlay = overlay || input.graphDelta.order || touchedEdges.size > 0
    items = items || readItemsChangedFromGraphDelta(input.graphDelta)
  }

  appendIds(edges, idDelta.touched(input.current.delta.session.draft.edges))
  appendIds(nodes, idDelta.touched(input.current.delta.session.preview.nodes))
  appendIds(edges, idDelta.touched(input.current.delta.session.preview.edges))
  appendIds(statics, idDelta.touched(input.current.delta.session.preview.edges))
  appendIds(labels, idDelta.touched(input.current.delta.session.preview.edges))
  appendIds(active, idDelta.touched(input.current.delta.session.preview.edges))
  appendIds(masks, idDelta.touched(input.current.delta.session.preview.edges))

  appendMindmapNodeIds({
    target: nodes,
    mindmapIds: idDelta.touched(input.current.delta.session.preview.mindmaps),
    readNodeIds: input.readMindmapNodeIds
  })
  appendMindmapNodeIds({
    target: nodes,
    mindmapIds: input.current.delta.clock.mindmaps,
    readNodeIds: input.readMindmapNodeIds
  })

  if (
    input.current.delta.session.preview.mindmaps.added.size > 0
    || input.current.delta.session.preview.mindmaps.updated.size > 0
    || input.current.delta.session.preview.mindmaps.removed.size > 0
  ) {
    chrome = true
  }

  if (input.current.delta.session.selection) {
    appendIds(nodes, collectSelectedNodeIds(input.state))
    appendIds(edges, collectSelectedEdgeIds(input.state))
    appendIds(nodes, input.current.interaction.selection.nodeIds)
    appendIds(edges, input.current.interaction.selection.edgeIds)
    appendIds(active, collectSelectedEdgeIds(input.state))
    appendIds(active, input.current.interaction.selection.edgeIds)
    appendIds(labels, collectSelectedEdgeIds(input.state))
    appendIds(labels, input.current.interaction.selection.edgeIds)

    chrome = chrome || (
      hasSelection(input.state)
      !== (
        input.current.interaction.selection.nodeIds.length > 0
        || input.current.interaction.selection.edgeIds.length > 0
      )
    )
    overlay = true
  }

  if (input.current.delta.session.hover) {
    chrome = true

    const previousNodeId = readHoveredNodeId(input.state.ui.chrome.hover)
    const nextNodeId = readHoveredNodeId(input.current.interaction.hover)
    const previousEdgeId = readHoveredEdgeId(input.state.ui.chrome.hover)
    const nextEdgeId = readHoveredEdgeId(input.current.interaction.hover)

    if (previousNodeId) {
      nodes.add(previousNodeId)
    }
    if (nextNodeId) {
      nodes.add(nextNodeId)
    }
    if (previousEdgeId) {
      edges.add(previousEdgeId)
      active.add(previousEdgeId)
    }
    if (nextEdgeId) {
      edges.add(nextEdgeId)
      active.add(nextEdgeId)
    }
  }

  if (input.current.delta.session.preview.marquee) {
    chrome = true
  }
  if (input.current.delta.session.preview.guides) {
    chrome = true
  }
  if (input.current.delta.session.preview.draw) {
    chrome = true
    appendIds(
      nodes,
      input.state.ui.chrome.preview.draw?.hiddenNodeIds ?? []
    )
    appendIds(
      nodes,
      input.current.session.preview.draw?.hiddenNodeIds ?? []
    )
  }
  if (input.current.delta.session.edit) {
    chrome = true

    const previousEditingNode = readEditingNodeId(input.state.ui.chrome.edit)
    const nextEditingNode = readEditingNodeId(input.current.session.edit)
    const previousEditing = readEditingEdgeId(input.state.ui.chrome.edit)
    const nextEditing = readEditingEdgeId(input.current.session.edit)

    if (previousEditingNode) {
      nodes.add(previousEditingNode)
    }
    if (nextEditingNode) {
      nodes.add(nextEditingNode)
    }
    if (previousEditing) {
      active.add(previousEditing)
      labels.add(previousEditing)
    }
    if (nextEditing) {
      active.add(nextEditing)
      labels.add(nextEditing)
    }

    overlay = true
  }
  if (
    input.current.delta.session.tool
    || input.current.delta.session.interaction
    || input.current.delta.session.preview.edgeGuide
  ) {
    chrome = true
    overlay = true
  }

  return {
    reset: input.reset,
    chrome,
    items,
    nodes,
    edges,
    statics,
    labels,
    active,
    masks,
    overlay
  }
}

const createGraphPhase = (): ProjectionPhase<
  'graph',
  {
    input: Input
    state: WorkingState
    revision: number
    scope: ProjectionScopeValue<EditorPhaseScopeMap['graph']>
  },
  { count: number },
  EditorScenePhaseName,
  EditorPhaseScopeMap
> => ({
  name: 'graph',
  deps: [],
  scope: graphPhaseScope,
  run: (context) => {
    patchDocumentState({
      current: context.input,
      working: context.state,
      reset: context.scope.reset
    })
    const result = patchGraphState({
      revision: context.revision,
      current: context.input,
      working: context.state,
      scope: context.scope
    })

    return {
      action: result.count > 0
        ? 'sync'
        : 'reuse',
      metrics: {
        count: result.count
      },
      emit: {
        ...(result.spatialChanged
          ? {
              spatial: {
                reset: context.scope.reset,
                graph: true
              } satisfies SpatialPatchScope
            }
          : {}),
        view: readViewPatchScope({
          reset: context.scope.reset,
          current: context.input,
          state: context.state,
          graphDelta: context.state.delta.graph,
          readAllEdgeIds: () => context.state.graph.edges.keys(),
          readMindmapNodeIds: (mindmapId) => (
            context.state.graph.owners.mindmaps.get(mindmapId)?.structure.nodeIds
          )
        })
      }
    }
  }
})

const spatialPhase: ProjectionPhase<
  'spatial',
  {
    input: Input
    state: WorkingState
    revision: number
    scope: ProjectionScopeValue<EditorPhaseScopeMap['spatial']>
  },
  { count: number },
  EditorScenePhaseName,
  EditorPhaseScopeMap
> = {
  name: 'spatial',
  deps: [],
  scope: spatialPhaseScope,
  run: (context) => {
    const result = patchSpatial({
      revision: context.revision,
      graph: context.state.graph,
      snapshot: context.input.document.snapshot,
      graphDelta: context.state.delta.graph,
      state: context.state.spatial,
      scope: context.scope,
      delta: context.state.delta.spatial
    })

    return {
      action: result.changed ? 'sync' : 'reuse',
      metrics: {
        count: result.count
      }
    }
  }
}

const viewPhase: ProjectionPhase<
  'view',
  {
    input: Input
    state: WorkingState
    revision: number
    scope: ProjectionScopeValue<EditorPhaseScopeMap['view']>
  },
  { count: number },
  EditorScenePhaseName,
  EditorPhaseScopeMap
> = {
  name: 'view',
  deps: [],
  scope: viewPhaseScope,
  run: (context) => {
    const count = patchViewState({
      current: context.input,
      working: context.state,
      scope: context.scope
    })

    return {
      action: count > 0
        ? 'sync'
        : 'reuse',
      metrics: {
        count
      }
    }
  }
}

export const createEditorSceneProjectionModel = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}) => {
  return defineProjectionModel<
  Input,
  WorkingState,
  ReturnType<typeof createEditorSceneRead>,
  {
    document: {
      revision: ReturnType<typeof value<WorkingState, Revision>>
      background: ReturnType<typeof value<WorkingState, WorkingState['document']['background']>>
    }
    graph: {
      node: ReturnType<typeof family<WorkingState, NodeId, WorkingState['graph']['nodes'] extends Map<NodeId, infer TValue> ? TValue : never>>
      edge: ReturnType<typeof family<WorkingState, EdgeId, WorkingState['graph']['edges'] extends Map<EdgeId, infer TValue> ? TValue : never>>
      mindmap: ReturnType<typeof family<WorkingState, MindmapId, WorkingState['graph']['owners']['mindmaps'] extends Map<MindmapId, infer TValue> ? TValue : never>>
      group: ReturnType<typeof family<WorkingState, GroupId, WorkingState['graph']['owners']['groups'] extends Map<GroupId, infer TValue> ? TValue : never>>
      state: {
        node: ReturnType<typeof family<WorkingState, NodeId, WorkingState['graph']['state']['node'] extends Map<NodeId, infer TValue> ? TValue : never>>
        edge: ReturnType<typeof family<WorkingState, EdgeId, WorkingState['graph']['state']['edge'] extends Map<EdgeId, infer TValue> ? TValue : never>>
        chrome: ReturnType<typeof value<WorkingState, WorkingState['graph']['state']['chrome']>>
      }
    }
    render: {
      node: ReturnType<typeof family<WorkingState, NodeId, WorkingState['render']['node'] extends Map<NodeId, infer TValue> ? TValue : never>>
      edge: {
        statics: ReturnType<typeof family<WorkingState, EdgeStaticId, EdgeStaticView>>
        active: ReturnType<typeof family<WorkingState, EdgeId, EdgeActiveView>>
        labels: ReturnType<typeof family<WorkingState, EdgeLabelKey, WorkingState['render']['labels'] extends Map<EdgeLabelKey, infer TValue> ? TValue : never>>
        masks: ReturnType<typeof family<WorkingState, EdgeId, WorkingState['render']['masks'] extends Map<EdgeId, infer TValue> ? TValue : never>>
      }
      chrome: {
        scene: ReturnType<typeof value<WorkingState, WorkingState['render']['chrome']>>
        edge: ReturnType<typeof value<WorkingState, WorkingState['render']['overlay']>>
      }
    }
    items: ReturnType<typeof value<WorkingState, WorkingState['items']>>
  },
  EditorScenePhaseName,
  EditorPhaseScopeMap,
  { count: number },
  Capture
>({
  createState: () => createWorking({
    measure: input.measure
  }),
  createRead: (runtime) => createEditorSceneRead({
    revision: runtime.revision,
    state: runtime.state,
    items: () => runtime.state().items,
    spatial: () => runtime.state().spatial,
    nodeCapability: input.nodeCapability,
    view: input.view
  }),
  capture: ({ state, revision }) => buildEditorSceneCapture(
    state,
    revision
  ),
  surface: {
    document: {
      revision: value({
        read: (state) => state.revision.document
      }),
      background: value({
        read: (state) => state.document.background
      })
    },
    graph: {
      node: family({
        read: (state) => ({
          ids: [...state.graph.nodes.keys()],
          byId: state.graph.nodes
        })
      }),
      edge: family({
        read: (state) => ({
          ids: [...state.graph.edges.keys()],
          byId: state.graph.edges
        })
      }),
      mindmap: family({
        read: (state) => ({
          ids: [...state.graph.owners.mindmaps.keys()],
          byId: state.graph.owners.mindmaps
        })
      }),
      group: family({
        read: (state) => ({
          ids: [...state.graph.owners.groups.keys()],
          byId: state.graph.owners.groups
        })
      }),
      state: {
        node: family({
          read: (state) => ({
            ids: [...state.graph.state.node.keys()],
            byId: state.graph.state.node
          })
        }),
        edge: family({
          read: (state) => ({
            ids: [...state.graph.state.edge.keys()],
            byId: state.graph.state.edge
          })
        }),
        chrome: value({
          read: (state) => state.graph.state.chrome
        })
      }
    },
    render: {
      node: family({
        read: (state) => ({
          ids: [...state.render.node.keys()],
          byId: state.render.node
        })
      }),
      edge: {
        statics: family({
          read: (state) => ({
            ids: [...state.render.statics.statics.keys()],
            byId: state.render.statics.statics
          })
        }),
        active: family({
          read: (state) => ({
            ids: [...state.render.active.keys()],
            byId: state.render.active
          })
        }),
        labels: family({
          read: (state) => ({
            ids: [...state.render.labels.keys()],
            byId: state.render.labels
          })
        }),
        masks: family({
          read: (state) => ({
            ids: [...state.render.masks.keys()],
            byId: state.render.masks
          })
        }),
      },
      chrome: {
        scene: value({
          read: (state) => state.render.chrome
        }),
        edge: value({
          read: (state) => state.render.overlay
        })
      }
    },
    items: value({
      read: (state) => state.items
    })
  },
  plan: ({ input, state, revision }) => {
    const bootstrap = revision === 1
    const graphScope = bootstrap
      ? {
          reset: true,
          order: true
        }
      : readGraphPlanScope(input)

    if (bootstrap || hasGraphPlanScope(graphScope)) {
      return createPlan<EditorScenePhaseName, EditorPhaseScopeMap>({
        phases: ['graph'],
        scope: {
          graph: graphScope
        }
      })
    }

    return createPlan<EditorScenePhaseName, EditorPhaseScopeMap>({
      scope: {
        view: readViewPatchScope({
          current: input,
          state,
          readAllEdgeIds: () => state.graph.edges.keys(),
          readMindmapNodeIds: (mindmapId) => (
            state.graph.owners.mindmaps.get(mindmapId)?.structure.nodeIds
          )
        })
      }
    })
  },
  phases: [
    createGraphPhase(),
    spatialPhase,
    viewPhase
  ]
})
}
