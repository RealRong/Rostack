import {
  type ProjectionFamilyField,
  type ProjectionFamilySnapshot,
  type ProjectionSpec,
  type ProjectionValueField,
  type Revision,
} from '@shared/projection'
import {
  entityDelta,
  hasChangeState,
  idDelta
} from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  HoverState,
  Input,
  NodeCapabilityInput,
  SceneViewInput,
  TextMeasure
} from '../contracts/editor'
import type { Capture } from '../contracts/capture'
import type {
  EditorPhaseScopeMap,
  GraphDelta,
  ItemsPatchScope,
  RenderPatchScope,
  ScopeInputValue,
  SpatialPatchScope,
  UiPatchScope
} from '../contracts/delta'
import {
  graphPhaseScope,
  itemsPhaseScope,
  renderPhaseScope,
  spatialPhaseScope,
  uiPhaseScope
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
import type { SceneItemKey } from '../contracts/delta'
import { patchGraphState } from '../model/graph/patch'
import { patchDocumentState } from '../model/document/patch'
import { patchItemsState } from '../model/items/patch'
import { patchRenderState } from '../model/render/patch'
import { patchSpatial } from '../model/spatial/update'
import { patchUiState } from '../model/ui/patch'
import { createEditorSceneRead } from './read'
import { buildEditorSceneCapture } from './capture'
import { createWorking } from './state'

export type EditorScenePhaseName = keyof EditorPhaseScopeMap & string

type GraphScopeInput =
  NonNullable<ScopeInputValue<EditorPhaseScopeMap['graph']>>

type UiScopeInput =
  NonNullable<ScopeInputValue<EditorPhaseScopeMap['ui']>>

type RenderScopeInput =
  NonNullable<ScopeInputValue<EditorPhaseScopeMap['render']>>

type EditorSceneSurface = {
  document: {
    revision: ProjectionValueField<WorkingState, Revision>
    background: ProjectionValueField<WorkingState, WorkingState['document']['background']>
  }
  graph: {
    node: ProjectionFamilyField<WorkingState, NodeId, WorkingState['graph']['nodes'] extends Map<NodeId, infer TValue> ? TValue : never>
    edge: ProjectionFamilyField<WorkingState, EdgeId, WorkingState['graph']['edges'] extends Map<EdgeId, infer TValue> ? TValue : never>
    mindmap: ProjectionFamilyField<WorkingState, MindmapId, WorkingState['graph']['owners']['mindmaps'] extends Map<MindmapId, infer TValue> ? TValue : never>
    group: ProjectionFamilyField<WorkingState, GroupId, WorkingState['graph']['owners']['groups'] extends Map<GroupId, infer TValue> ? TValue : never>
    state: {
      node: ProjectionFamilyField<WorkingState, NodeId, WorkingState['graph']['state']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
      edge: ProjectionFamilyField<WorkingState, EdgeId, WorkingState['graph']['state']['edge'] extends Map<EdgeId, infer TValue> ? TValue : never>
      chrome: ProjectionValueField<WorkingState, WorkingState['graph']['state']['chrome']>
    }
  }
  render: {
    node: ProjectionFamilyField<WorkingState, NodeId, WorkingState['render']['node'] extends Map<NodeId, infer TValue> ? TValue : never>
    edge: {
      statics: ProjectionFamilyField<WorkingState, EdgeStaticId, EdgeStaticView>
      active: ProjectionFamilyField<WorkingState, EdgeId, EdgeActiveView>
      labels: ProjectionFamilyField<WorkingState, EdgeLabelKey, WorkingState['render']['labels'] extends Map<EdgeLabelKey, infer TValue> ? TValue : never>
      masks: ProjectionFamilyField<WorkingState, EdgeId, WorkingState['render']['masks'] extends Map<EdgeId, infer TValue> ? TValue : never>
    }
    chrome: {
      scene: ProjectionValueField<WorkingState, WorkingState['render']['chrome']>
      edge: ProjectionValueField<WorkingState, WorkingState['render']['overlay']>
    }
  }
  items: ProjectionFamilyField<WorkingState, SceneItemKey, WorkingState['items']['byId'] extends ReadonlyMap<SceneItemKey, infer TValue> ? TValue : never>
}

type EditorSceneProjectionSpec = ProjectionSpec<
  Input,
  WorkingState,
  ReturnType<typeof createEditorSceneRead>,
  EditorSceneSurface,
  EditorScenePhaseName,
  EditorPhaseScopeMap,
  { count: number },
  Capture
>

type EditorScenePhaseEntry<TName extends EditorScenePhaseName> =
  EditorSceneProjectionSpec['phases'][TName]

const sameOrder = <T,>(
  left: readonly T[],
  right: readonly T[]
): boolean => (
  left.length === right.length
  && left.every((value, index) => Object.is(value, right[index]))
)

const createStableMapFamilyRead = <
  TKey extends string,
  TValue
>(
  select: (state: WorkingState) => ReadonlyMap<TKey, TValue>
): ((state: WorkingState) => ProjectionFamilySnapshot<TKey, TValue>) => {
  let previousMap: ReadonlyMap<TKey, TValue> | undefined
  let previousIds: readonly TKey[] = []

  return (state) => {
    const byId = select(state)
    if (byId === previousMap) {
      return {
        ids: previousIds,
        byId
      }
    }

    const nextIds = [...byId.keys()]
    if (!sameOrder(previousIds, nextIds)) {
      previousIds = nextIds
    }
    previousMap = byId

    return {
      ids: previousIds,
      byId
    }
  }
}

const createStableFamilyRead = <
  TKey extends string,
  TValue
>(
  select: (state: WorkingState) => {
    ids: readonly TKey[]
    byId: ReadonlyMap<TKey, TValue>
  }
): ((state: WorkingState) => ProjectionFamilySnapshot<TKey, TValue>) => {
  let previousIds: readonly TKey[] = []
  let previousById: ReadonlyMap<TKey, TValue> | undefined

  return (state) => {
    const snapshot = select(state)
    const ids = sameOrder(previousIds, snapshot.ids)
      ? previousIds
      : snapshot.ids

    previousIds = ids
    previousById = snapshot.byId

    return {
      ids,
      byId: previousById
    }
  }
}

const toDeltaOrSkip = <TKey,>(
  delta: ReturnType<typeof entityDelta.fromIdDelta<TKey>>
) => delta ?? 'skip'

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

const readUiPatchScope = (input: {
  reset?: boolean
  current: Input
  state: WorkingState
  graphDelta?: GraphDelta
  readMindmapNodeIds: (mindmapId: MindmapId) => readonly NodeId[] | undefined
}): UiScopeInput => {
  const nodes = new Set<NodeId>()
  const edges = new Set<EdgeId>()
  let chrome = false

  if (input.graphDelta) {
    appendIds(nodes, idDelta.touched(input.graphDelta.entities.nodes))
    appendIds(edges, idDelta.touched(input.graphDelta.entities.edges))
    appendMindmapNodeIds({
      target: nodes,
      mindmapIds: idDelta.touched(input.graphDelta.entities.mindmaps),
      readNodeIds: input.readMindmapNodeIds
    })
  }

  appendIds(edges, idDelta.touched(input.current.delta.session.draft.edges))
  appendIds(nodes, idDelta.touched(input.current.delta.session.preview.nodes))
  appendIds(edges, idDelta.touched(input.current.delta.session.preview.edges))

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

    chrome = chrome || (
      hasSelection(input.state)
      !== (
        input.current.interaction.selection.nodeIds.length > 0
        || input.current.interaction.selection.edgeIds.length > 0
      )
    )
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
    }
    if (nextEdgeId) {
      edges.add(nextEdgeId)
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
      edges.add(previousEditing)
    }
    if (nextEditing) {
      edges.add(nextEditing)
    }
  }
  if (
    input.current.delta.session.tool
    || input.current.delta.session.interaction
    || input.current.delta.session.preview.edgeGuide
  ) {
    chrome = true
  }

  return {
    reset: input.reset,
    chrome,
    nodes,
    edges
  }
}

const readRenderScopeFromGraph = (input: {
  reset?: boolean
  state: WorkingState
}): RenderScopeInput => {
  const itemsChanged = input.state.delta.items.change !== undefined
  const changes = input.state.delta.graphChanges

  return {
    reset: input.reset,
    node: hasChangeState({
      lifecycle: 'ids',
      geometry: 'ids',
      content: 'ids',
      owner: 'ids'
    }, changes.node),
    statics: itemsChanged || hasChangeState({
      lifecycle: 'ids',
      route: 'ids',
      style: 'ids'
    }, {
      lifecycle: changes.edge.lifecycle,
      route: changes.edge.route,
      style: changes.edge.style
    }),
    active: hasChangeState({
      lifecycle: 'ids',
      route: 'ids',
      style: 'ids',
      box: 'ids'
    }, {
      lifecycle: changes.edge.lifecycle,
      route: changes.edge.route,
      style: changes.edge.style,
      box: changes.edge.box
    }),
    labels: hasChangeState({
      lifecycle: 'ids',
      route: 'ids',
      labels: 'ids'
    }, {
      lifecycle: changes.edge.lifecycle,
      route: changes.edge.route,
      labels: changes.edge.labels
    }),
    masks: hasChangeState({
      lifecycle: 'ids',
      route: 'ids',
      labels: 'ids'
    }, {
      lifecycle: changes.edge.lifecycle,
      route: changes.edge.route,
      labels: changes.edge.labels
    }),
    overlay: hasChangeState({
      route: 'ids',
      endpoints: 'ids',
      box: 'ids'
    }, {
      route: changes.edge.route,
      endpoints: changes.edge.endpoints,
      box: changes.edge.box
    }),
    chrome: false
  }
}

const readRenderScopeFromUi = (input: {
  reset?: boolean
  current: Input
  state: WorkingState
}): RenderScopeInput => ({
  reset: input.reset,
  node: idDelta.hasAny(input.state.delta.ui.node),
  statics: false,
  active: (
    idDelta.hasAny(input.state.delta.ui.edge)
    || input.current.delta.session.hover
    || input.current.delta.session.selection
    || input.current.delta.session.edit
  ),
  labels: (
    idDelta.hasAny(input.state.delta.ui.edge)
    || input.current.delta.session.selection
    || input.current.delta.session.edit
  ),
  masks: false,
  overlay: (
    input.current.delta.session.tool
    || input.current.delta.session.interaction
    || input.current.delta.session.preview.edgeGuide
    || input.current.delta.session.selection
    || input.current.delta.session.hover
    || input.current.delta.session.edit
  ),
  chrome: input.state.delta.ui.chrome
})

const createGraphPhase = (): EditorScenePhaseEntry<'graph'> => ({
  after: [],
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
    const graphChanged = (
      result.count > 0
      || context.scope.reset
      || context.scope.order
    )

    return {
      action: graphChanged
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
        ...(graphChanged
          ? {
              items: {
                reset: context.scope.reset,
                graph: true
              } satisfies ItemsPatchScope,
              ui: readUiPatchScope({
                reset: context.scope.reset,
                current: context.input,
                state: context.state,
                graphDelta: context.state.delta.graph,
                readMindmapNodeIds: (mindmapId) => (
                  context.state.graph.owners.mindmaps.get(mindmapId)?.structure.nodeIds
                )
              }),
              render: readRenderScopeFromGraph({
                reset: context.scope.reset,
                state: context.state
              })
            }
          : {
              ui: readUiPatchScope({
                reset: context.scope.reset,
                current: context.input,
                state: context.state,
                graphDelta: context.state.delta.graph,
                readMindmapNodeIds: (mindmapId) => (
                  context.state.graph.owners.mindmaps.get(mindmapId)?.structure.nodeIds
                )
              })
            })
      }
    }
  }
})

const spatialPhase: EditorScenePhaseEntry<'spatial'> = {
  after: ['graph'],
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

const itemsPhase: EditorScenePhaseEntry<'items'> = {
  after: ['graph'],
  scope: itemsPhaseScope,
  run: (context) => {
    const result = patchItemsState({
      revision: context.revision,
      snapshot: context.input.document.snapshot,
      working: context.state,
      reset: context.scope.reset || context.scope.graph
    })

    return {
      action: result.changed
        ? 'sync'
        : 'reuse',
      metrics: {
        count: result.count
      },
      emit: result.changed
        ? {
            render: {
              reset: context.scope.reset,
              node: false,
              statics: context.state.delta.items.change !== undefined,
              active: false,
              labels: false,
              masks: false,
              overlay: false,
              chrome: false
            } satisfies RenderPatchScope
          }
        : undefined
    }
  }
}

const uiPhase: EditorScenePhaseEntry<'ui'> = {
  after: ['graph'],
  scope: uiPhaseScope,
  run: (context) => {
    const count = patchUiState({
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
      },
      emit: {
        render: readRenderScopeFromUi({
          reset: context.scope.reset,
          current: context.input,
          state: context.state
        })
      }
    }
  }
}

const renderPhase: EditorScenePhaseEntry<'render'> = {
  after: ['graph', 'items', 'ui'],
  scope: renderPhaseScope,
  run: (context) => {
    const count = patchRenderState({
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

export const createEditorSceneProjectionSpec = (input: {
  measure?: TextMeasure
  nodeCapability?: NodeCapabilityInput
  view: SceneViewInput
}): EditorSceneProjectionSpec => ({
  createState: () => createWorking({
    measure: input.measure
  }),
  createRead: (runtime) => createEditorSceneRead({
    revision: runtime.revision,
    state: runtime.state,
    items: () => runtime.state().items.ids.map((key) => runtime.state().items.byId.get(key)!),
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
      revision: {
        kind: 'value',
        read: (state) => state.revision.document
      },
      background: {
        kind: 'value',
        read: (state) => state.document.background
      }
    },
    graph: {
      node: {
        kind: 'family',
        read: createStableMapFamilyRead((state) => state.graph.nodes),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.nodes)
        ),
        delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.nodes,
          order: state.delta.graph.order
        }))
      },
      edge: {
        kind: 'family',
        read: createStableMapFamilyRead((state) => state.graph.edges),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.edges)
        ),
        delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.edges,
          order: state.delta.graph.order
        }))
      },
      mindmap: {
        kind: 'family',
        read: createStableMapFamilyRead((state) => state.graph.owners.mindmaps),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.mindmaps)
        ),
        delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.mindmaps,
          order: state.delta.graph.order
        }))
      },
      group: {
        kind: 'family',
        read: createStableMapFamilyRead((state) => state.graph.owners.groups),
        idsEqual: sameOrder,
        changed: ({ state }) => (
          idDelta.hasAny(state.delta.graph.entities.groups)
        ),
        delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.graph.entities.groups
        }))
      },
      state: {
        node: {
          kind: 'family',
          read: createStableMapFamilyRead((state) => state.graph.state.node),
          idsEqual: sameOrder,
          changed: ({ state }) => idDelta.hasAny(state.delta.ui.node),
          delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.ui.node
          }))
        },
        edge: {
          kind: 'family',
          read: createStableMapFamilyRead((state) => state.graph.state.edge),
          idsEqual: sameOrder,
          changed: ({ state }) => idDelta.hasAny(state.delta.ui.edge),
          delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.ui.edge
          }))
        },
        chrome: {
          kind: 'value',
          read: (state) => state.graph.state.chrome,
          changed: ({ state }) => state.delta.ui.chrome
        }
      }
    },
    render: {
      node: {
        kind: 'family',
        read: createStableMapFamilyRead((state) => state.render.node),
        idsEqual: sameOrder,
        changed: ({ state }) => idDelta.hasAny(state.delta.render.node),
        delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
          changes: state.delta.render.node
        }))
      },
      edge: {
        statics: {
          kind: 'family',
          read: createStableMapFamilyRead((state) => state.render.statics.statics),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.statics)
            || state.delta.render.edge.staticsIds
          ),
          delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.statics,
            order: state.delta.render.edge.staticsIds
          }))
        },
        active: {
          kind: 'family',
          read: createStableMapFamilyRead((state) => state.render.active),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.active)
            || state.delta.render.edge.activeIds
          ),
          delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.active,
            order: state.delta.render.edge.activeIds
          }))
        },
        labels: {
          kind: 'family',
          read: createStableMapFamilyRead((state) => state.render.labels),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.labels)
            || state.delta.render.edge.labelsIds
          ),
          delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.labels,
            order: state.delta.render.edge.labelsIds
          }))
        },
        masks: {
          kind: 'family',
          read: createStableMapFamilyRead((state) => state.render.masks),
          idsEqual: sameOrder,
          changed: ({ state }) => (
            idDelta.hasAny(state.delta.render.edge.masks)
            || state.delta.render.edge.masksIds
          ),
          delta: ({ state }) => toDeltaOrSkip(entityDelta.fromIdDelta({
            changes: state.delta.render.edge.masks,
            order: state.delta.render.edge.masksIds
          }))
        }
      },
      chrome: {
        scene: {
          kind: 'value',
          read: (state) => state.render.chrome,
          changed: ({ state }) => state.delta.render.chrome.scene
        },
        edge: {
          kind: 'value',
          read: (state) => state.render.overlay,
          changed: ({ state }) => state.delta.render.chrome.edge
        }
      }
    },
    items: {
      kind: 'family',
      read: createStableFamilyRead((state) => state.items),
      idsEqual: sameOrder,
      changed: ({ state }) => state.delta.items.change !== undefined,
      delta: ({ state }) => state.delta.items.change ?? 'skip'
    }
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
      return {
        phases: ['graph'],
        scope: {
          graph: graphScope
        }
      }
    }

    return {
      phases: ['ui'],
      scope: {
        ui: readUiPatchScope({
          current: input,
          state,
          readMindmapNodeIds: (mindmapId) => (
            state.graph.owners.mindmaps.get(mindmapId)?.structure.nodeIds
          )
        })
      }
    }
  },
  phases: {
    graph: createGraphPhase(),
    spatial: spatialPhase,
    items: itemsPhase,
    ui: uiPhase,
    render: renderPhase
  }
})
