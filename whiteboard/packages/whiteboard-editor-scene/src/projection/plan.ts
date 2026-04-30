import { idDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { SceneItemKey } from '../contracts/delta'
import type { Input } from '../contracts/editor'
import type {
  EditorScenePlan,
  SceneScope
} from '../contracts/plan'
import {
  createEmptyEditorScenePlan,
  sceneScopeFromIdDelta,
  sceneScopeFromValues,
  sceneScopeHasAny,
  sceneScopeUnion
} from '../contracts/plan'
import type { WorkingState } from '../contracts/working'
import {
  appendEdgeItemScope,
  appendIds,
  appendMindmapNodeIds,
  appendMindmapNodeScope
} from '../model/scope'
import { collectUiRuntimeTouch } from '../model/ui/runtime'

const toScope = <TId extends string>(
  values: Iterable<TId>
): SceneScope<TId> => new Set(values)

const copyScope = <TId extends string>(
  scope: SceneScope<TId>
): Set<TId> => new Set(scope as ReadonlySet<TId>)

const scopeFromTouchedIds = <TId extends string>(
  ids: ReadonlySet<TId> | 'all'
): SceneScope<TId> => ids === 'all'
  ? 'all'
  : new Set(ids)

const hasGraphEntityLifecycle = (
  working: WorkingState
) => {
  const { entities } = working.phase.graph
  return (
    entities.nodes.added.size > 0
    || entities.nodes.removed.size > 0
    || entities.edges.added.size > 0
    || entities.edges.removed.size > 0
    || entities.mindmaps.added.size > 0
    || entities.mindmaps.removed.size > 0
    || entities.groups.added.size > 0
    || entities.groups.removed.size > 0
  )
}

const readRuntimeTouch = (
  current: Input
) => ({
  node: new Set<NodeId>([
    ...idDelta.touched(current.runtime.delta.session.preview.nodes),
    ...(current.runtime.session.edit?.kind === 'node'
      ? [current.runtime.session.edit.nodeId]
      : [])
  ]),
  edge: new Set<EdgeId>([
    ...idDelta.touched(current.runtime.delta.session.draft.edges),
    ...idDelta.touched(current.runtime.delta.session.preview.edges),
    ...(current.runtime.session.edit?.kind === 'edge-label'
      ? [current.runtime.session.edit.edgeId]
      : [])
  ]),
  mindmap: new Set<MindmapId>([
    ...idDelta.touched(current.runtime.delta.session.preview.mindmaps)
  ]),
  ui: Boolean(
    current.runtime.delta.session.tool
    || current.runtime.delta.session.selection
    || current.runtime.delta.session.hover
    || current.runtime.delta.session.edit
    || current.runtime.delta.session.interaction
    || current.runtime.delta.session.preview.marquee
    || current.runtime.delta.session.preview.guides
    || current.runtime.delta.session.preview.draw
    || current.runtime.delta.session.preview.edgeGuide
    || current.runtime.delta.session.preview.mindmaps.added.size > 0
    || current.runtime.delta.session.preview.mindmaps.updated.size > 0
    || current.runtime.delta.session.preview.mindmaps.removed.size > 0
  )
})

const readGraphTouch = (input: {
  current: Input
  working: WorkingState
  reset: boolean
}) => {
  if (input.reset) {
    return {
      node: {
        entity: 'all' as const,
        geometry: 'all' as const,
        content: 'all' as const,
        owner: 'all' as const
      },
      edge: {
        entity: 'all' as const,
        geometry: 'all' as const,
        content: 'all' as const
      },
      mindmap: {
        entity: 'all' as const,
        geometry: 'all' as const,
        owner: 'all' as const
      },
      group: {
        entity: 'all' as const,
        geometry: 'all' as const,
        owner: 'all' as const
      }
    }
  }

  const editingNode = input.current.runtime.session.edit?.kind === 'node'
    ? sceneScopeFromValues([input.current.runtime.session.edit.nodeId])
    : new Set<NodeId>()
  const editingEdge = input.current.runtime.session.edit?.kind === 'edge-label'
    ? sceneScopeFromValues([input.current.runtime.session.edit.edgeId])
    : new Set<EdgeId>()

  return {
    node: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.nodes),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.nodes),
      content: sceneScopeUnion(
        scopeFromTouchedIds(input.current.delta.node.content.touchedIds()),
        editingNode
      ),
      owner: scopeFromTouchedIds(input.current.delta.node.owner.touchedIds())
    },
    edge: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.edges),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.edges),
      content: sceneScopeUnion(
        scopeFromTouchedIds(input.current.delta.edge.labels.touchedIds()),
        scopeFromTouchedIds(input.current.delta.edge.style.touchedIds()),
        scopeFromTouchedIds(input.current.delta.edge.data.touchedIds()),
        editingEdge
      )
    },
    mindmap: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.mindmaps),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.mindmaps),
      owner: scopeFromTouchedIds(input.current.delta.mindmap.structure.touchedIds())
    },
    group: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.groups),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.groups),
      owner: scopeFromTouchedIds(input.current.delta.group.value.touchedIds())
    }
  }
}

const readActiveEdgeIds = (
  current: Input
): ReadonlySet<EdgeId> => {
  const edgeIds = new Set<EdgeId>()
  current.runtime.interaction.selection.edgeIds.forEach((edgeId) => {
    edgeIds.add(edgeId)
  })
  if (current.runtime.interaction.hover.kind === 'edge') {
    edgeIds.add(current.runtime.interaction.hover.edgeId)
  }
  if (current.runtime.session.edit?.kind === 'edge-label') {
    edgeIds.add(current.runtime.session.edit.edgeId)
  }
  return edgeIds
}

const collectItemChangeScope = (
  working: WorkingState
): SceneScope<SceneItemKey> => {
  const change = working.delta.items
  if (change === 'skip' || change === 'replace') {
    return new Set<SceneItemKey>()
  }

  return new Set<SceneItemKey>([
    ...(change.set?.map(([key]) => key) ?? []),
    ...(change.remove ?? [])
  ])
}

export const createEditorScenePlan = (
  input: Input
): EditorScenePlan => {
  const plan = createEmptyEditorScenePlan()
  const runtimeTouch = readRuntimeTouch(input)
  const nodeTargets = sceneScopeUnion(
    input.delta.node.create.touchedIds(),
    input.delta.node.delete.touchedIds(),
    input.delta.node.geometry.touchedIds(),
    input.delta.node.owner.touchedIds(),
    input.delta.node.content.touchedIds()
  )
  const edgeTargets = sceneScopeUnion(
    input.delta.edge.create.touchedIds(),
    input.delta.edge.delete.touchedIds(),
    input.delta.edge.endpoints.touchedIds(),
    input.delta.edge.route.touchedIds(),
    input.delta.edge.style.touchedIds(),
    input.delta.edge.labels.touchedIds(),
    input.delta.edge.data.touchedIds()
  )
  const mindmapTargets = sceneScopeUnion(
    input.delta.mindmap.create.touchedIds(),
    input.delta.mindmap.delete.touchedIds(),
    input.delta.mindmap.structure.touchedIds(),
    input.delta.mindmap.layout.touchedIds()
  )
  const groupTargets = sceneScopeUnion(
    input.delta.group.create.touchedIds(),
    input.delta.group.delete.touchedIds(),
    input.delta.group.value.touchedIds()
  )

  plan.reset = input.delta.reset === true
    || nodeTargets === 'all'
    || edgeTargets === 'all'
    || mindmapTargets === 'all'
    || groupTargets === 'all'
  plan.order = plan.reset || input.delta.canvas.orderChanged()

  if (plan.reset) {
    plan.graph.node = 'all'
    plan.graph.edge = 'all'
    plan.graph.mindmap = 'all'
    plan.graph.group = 'all'
    return plan
  }

  const nodeTargetIds = copyScope(nodeTargets)
  const edgeTargetIds = copyScope(edgeTargets)
  const mindmapTargetIds = copyScope(mindmapTargets)
  const groupTargetIds = copyScope(groupTargets)

  appendIds(edgeTargetIds, runtimeTouch.edge)
  appendIds(nodeTargetIds, runtimeTouch.node)
  appendIds(mindmapTargetIds, runtimeTouch.mindmap)

  appendIds(edgeTargetIds, input.runtime.session.draft.edges.keys())
  appendIds(nodeTargetIds, input.runtime.session.preview.nodes.keys())
  appendIds(edgeTargetIds, input.runtime.session.preview.edges.keys())

  if (input.runtime.session.preview.mindmap?.rootMove) {
    mindmapTargetIds.add(input.runtime.session.preview.mindmap.rootMove.mindmapId)
  }
  if (input.runtime.session.preview.mindmap?.subtreeMove) {
    mindmapTargetIds.add(input.runtime.session.preview.mindmap.subtreeMove.mindmapId)
  }

  plan.graph = {
    node: toScope(nodeTargetIds),
    edge: toScope(edgeTargetIds),
    mindmap: toScope(mindmapTargetIds),
    group: toScope(groupTargetIds)
  }

  return plan
}

export const refreshEditorScenePlanAfterGraph = (input: {
  current: Input
  working: WorkingState
  plan: EditorScenePlan
  reset: boolean
}) => {
  const graphTouch = readGraphTouch(input)
  const runtimeTouch = readRuntimeTouch(input.current)

  input.plan.graph = {
    node: graphTouch.node.entity,
    edge: graphTouch.edge.entity,
    mindmap: graphTouch.mindmap.entity,
    group: graphTouch.group.entity
  }
  input.plan.spatial = {
    node: sceneScopeUnion(graphTouch.node.entity, graphTouch.node.geometry),
    edge: sceneScopeUnion(graphTouch.edge.entity, graphTouch.edge.geometry),
    mindmap: sceneScopeUnion(graphTouch.mindmap.entity, graphTouch.mindmap.geometry),
    group: sceneScopeUnion(graphTouch.group.entity, graphTouch.group.geometry),
    order: input.reset || input.plan.order
  }
  input.plan.items = input.reset || input.plan.order || hasGraphEntityLifecycle(input.working)
    ? 'all'
    : new Set<SceneItemKey>()

  if (input.reset) {
    input.plan.ui = {
      node: 'all',
      edge: 'all',
      chrome: true
    }
    return
  }

  const node = new Set<NodeId>()
  const edge = new Set<EdgeId>()
  let chrome = runtimeTouch.ui

  appendIds(node, graphTouch.node.entity as ReadonlySet<NodeId>)
  appendIds(node, graphTouch.node.geometry as ReadonlySet<NodeId>)
  appendIds(node, graphTouch.node.content as ReadonlySet<NodeId>)
  appendIds(node, graphTouch.node.owner as ReadonlySet<NodeId>)
  appendIds(edge, graphTouch.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edge, graphTouch.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edge, graphTouch.edge.content as ReadonlySet<EdgeId>)
  appendMindmapNodeScope({
    target: node,
    scope: graphTouch.mindmap.entity,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphTouch.mindmap.geometry,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphTouch.mindmap.owner,
    working: input.working
  })
  appendIds(node, runtimeTouch.node)
  appendIds(edge, runtimeTouch.edge)
  appendMindmapNodeIds({
    target: node,
    mindmapIds: runtimeTouch.mindmap,
    working: input.working
  })

  if (runtimeTouch.ui) {
    const runtimeUiTouch = collectUiRuntimeTouch({
      current: input.current,
      working: input.working
    })
    appendIds(node, runtimeUiTouch.node)
    appendIds(edge, runtimeUiTouch.edge)
    chrome = chrome || runtimeUiTouch.chrome
  }

  input.plan.ui = {
    node: toScope(node),
    edge: toScope(edge),
    chrome
  }
}

export const refreshEditorScenePlanAfterItems = (input: {
  working: WorkingState
  plan: EditorScenePlan
  reset: boolean
}) => {
  input.plan.items = input.reset
    ? 'all'
    : collectItemChangeScope(input.working)
}

export const refreshEditorScenePlanAfterUi = (input: {
  working: WorkingState
  plan: EditorScenePlan
  reset: boolean
}) => {
  input.plan.ui = input.reset
    ? {
        node: 'all',
        edge: 'all',
        chrome: true
      }
    : {
        node: sceneScopeFromIdDelta(input.working.phase.ui.node),
        edge: sceneScopeFromIdDelta(input.working.phase.ui.edge),
        chrome: input.working.phase.ui.chrome
      }
}

export const refreshEditorScenePlanForRender = (input: {
  current: Input
  working: WorkingState
  plan: EditorScenePlan
  reset: boolean
}) => {
  if (input.reset) {
    input.plan.render = {
      node: 'all',
      edgeStatics: 'all',
      edgeActive: 'all',
      edgeLabels: 'all',
      edgeMasks: 'all',
      chromeScene: true,
      chromeEdge: true
    }
    return
  }

  const graphTouch = readGraphTouch(input)
  const runtimeTouch = readRuntimeTouch(input.current)
  const node = new Set<NodeId>()
  const edgeStatics = new Set<EdgeId>()
  const edgeLabels = new Set<EdgeId>()
  const edgeMasks = new Set<EdgeId>()
  const edgeActive = new Set<EdgeId>([
    ...readActiveEdgeIds(input.current),
    ...input.working.render.active.keys()
  ])

  appendIds(node, graphTouch.node.entity as ReadonlySet<NodeId>)
  appendIds(node, graphTouch.node.geometry as ReadonlySet<NodeId>)
  appendIds(node, graphTouch.node.content as ReadonlySet<NodeId>)
  appendIds(node, graphTouch.node.owner as ReadonlySet<NodeId>)
  if (input.plan.ui.node !== 'all') {
    appendIds(node, input.plan.ui.node)
  }
  appendMindmapNodeScope({
    target: node,
    scope: graphTouch.mindmap.entity,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphTouch.mindmap.geometry,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphTouch.mindmap.owner,
    working: input.working
  })
  appendIds(node, runtimeTouch.node)

  appendIds(edgeStatics, graphTouch.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeStatics, graphTouch.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeStatics, graphTouch.edge.content as ReadonlySet<EdgeId>)
  appendEdgeItemScope({
    target: edgeStatics,
    scope: input.plan.items,
    working: input.working
  })

  appendIds(edgeLabels, graphTouch.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeLabels, graphTouch.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeLabels, graphTouch.edge.content as ReadonlySet<EdgeId>)
  if (input.plan.ui.edge !== 'all') {
    appendIds(edgeLabels, input.plan.ui.edge)
  }

  appendIds(edgeMasks, graphTouch.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeMasks, graphTouch.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeMasks, graphTouch.edge.content as ReadonlySet<EdgeId>)

  appendIds(edgeActive, graphTouch.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeActive, graphTouch.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeActive, graphTouch.edge.content as ReadonlySet<EdgeId>)
  if (input.plan.ui.edge !== 'all') {
    appendIds(edgeActive, input.plan.ui.edge)
  }

  input.plan.render = {
    node: toScope(node),
    edgeStatics: toScope(edgeStatics),
    edgeActive: toScope(edgeActive),
    edgeLabels: toScope(edgeLabels),
    edgeMasks: toScope(edgeMasks),
    chromeScene: input.plan.ui.chrome,
    chromeEdge: (
      runtimeTouch.ui
      || input.plan.ui.chrome
      || sceneScopeHasAny(input.plan.ui.edge)
      || sceneScopeHasAny(graphTouch.edge.entity)
      || sceneScopeHasAny(graphTouch.edge.geometry)
      || sceneScopeHasAny(graphTouch.edge.content)
    )
  }
}
