import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { SceneItemKey } from '../contracts/delta'
import type { Input } from '../contracts/editor'
import type {
  EditorSceneFacts,
  EditorSceneGraphFacts,
  EditorSceneInputFacts,
  EditorSceneItemsFacts,
  EditorSceneRenderFacts,
  EditorSceneUiFacts,
  SceneScope
} from '../contracts/facts'
import {
  sceneScopeFromIdDelta,
  sceneScopeFromValues,
  sceneScopeHasAny,
  sceneScopeUnion
} from '../contracts/facts'
import type { WorkingState } from '../contracts/working'
import {
  appendEdgeItemScope,
  appendIds,
  appendMindmapNodeIds,
  appendMindmapNodeScope
} from './scope'
import { collectUiRuntimeTouch } from './ui/runtime'

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

export const createInputFacts = (
  input: Input
): EditorSceneInputFacts => {
  const runtimeFacts = input.runtime.facts
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

  const reset = input.delta.reset === true
    || nodeTargets === 'all'
    || edgeTargets === 'all'
    || mindmapTargets === 'all'
    || groupTargets === 'all'
  const order = reset || input.delta.canvas.orderChanged()

  if (reset) {
    return {
      reset,
      order,
      graph: {
        node: 'all',
        edge: 'all',
        mindmap: 'all',
        group: 'all'
      }
    }
  }

  const nodeTargetIds = copyScope(nodeTargets)
  const edgeTargetIds = copyScope(edgeTargets)
  const mindmapTargetIds = copyScope(mindmapTargets)
  const groupTargetIds = copyScope(groupTargets)

  appendIds(edgeTargetIds, runtimeFacts.touchedEdgeIds)
  appendIds(nodeTargetIds, runtimeFacts.touchedNodeIds)
  appendIds(mindmapTargetIds, runtimeFacts.touchedMindmapIds)

  appendIds(edgeTargetIds, input.runtime.session.draft.edges.keys())
  appendIds(nodeTargetIds, Object.keys(input.runtime.session.preview.nodes))
  appendIds(edgeTargetIds, Object.keys(input.runtime.session.preview.edges))

  if (input.runtime.session.preview.mindmap?.rootMove) {
    mindmapTargetIds.add(input.runtime.session.preview.mindmap.rootMove.mindmapId)
  }
  if (input.runtime.session.preview.mindmap?.subtreeMove) {
    mindmapTargetIds.add(input.runtime.session.preview.mindmap.subtreeMove.mindmapId)
  }

  return {
    reset,
    order,
    graph: {
      node: toScope(nodeTargetIds),
      edge: toScope(edgeTargetIds),
      mindmap: toScope(mindmapTargetIds),
      group: toScope(groupTargetIds)
    }
  }
}

export const createGraphFacts = (input: {
  current: Input
  working: WorkingState
  reset: boolean
}): EditorSceneGraphFacts => {
  if (input.reset) {
    return {
      node: {
        entity: 'all',
        geometry: 'all',
        content: 'all',
        owner: 'all'
      },
      edge: {
        entity: 'all',
        geometry: 'all',
        content: 'all'
      },
      mindmap: {
        entity: 'all',
        geometry: 'all',
        owner: 'all'
      },
      group: {
        entity: 'all',
        geometry: 'all',
        owner: 'all'
      },
      hasLifecycleChange: true
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
    },
    hasLifecycleChange: hasGraphEntityLifecycle(input.working)
  }
}

export const createItemsFacts = (input: {
  working: WorkingState
  reset: boolean
}): EditorSceneItemsFacts => ({
  touched: input.reset
    ? 'all'
    : collectItemChangeScope(input.working)
})

export const createUiTargets = (input: {
  current: Input
  working: WorkingState
  reset: boolean
}): EditorSceneUiFacts => {
  if (input.reset) {
    return {
      node: 'all',
      edge: 'all',
      chrome: true
    }
  }

  const runtimeFacts = input.current.runtime.facts
  const graphFacts = input.working.facts.graph
  const node = new Set<NodeId>()
  const edge = new Set<EdgeId>()
  let chrome = runtimeFacts.uiChanged

  appendIds(node, graphFacts.node.entity as ReadonlySet<NodeId>)
  appendIds(node, graphFacts.node.geometry as ReadonlySet<NodeId>)
  appendIds(node, graphFacts.node.content as ReadonlySet<NodeId>)
  appendIds(node, graphFacts.node.owner as ReadonlySet<NodeId>)
  appendIds(edge, graphFacts.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edge, graphFacts.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edge, graphFacts.edge.content as ReadonlySet<EdgeId>)
  appendMindmapNodeScope({
    target: node,
    scope: graphFacts.mindmap.entity,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphFacts.mindmap.geometry,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphFacts.mindmap.owner,
    working: input.working
  })
  appendIds(node, runtimeFacts.touchedNodeIds)
  appendIds(edge, runtimeFacts.touchedEdgeIds)
  appendMindmapNodeIds({
    target: node,
    mindmapIds: runtimeFacts.touchedMindmapIds,
    working: input.working
  })

  if (runtimeFacts.uiChanged) {
    const runtimeUiTouch = collectUiRuntimeTouch({
      current: input.current,
      working: input.working
    })
    appendIds(node, runtimeUiTouch.node)
    appendIds(edge, runtimeUiTouch.edge)
    chrome = chrome || runtimeUiTouch.chrome
  }

  return {
    node: toScope(node),
    edge: toScope(edge),
    chrome
  }
}

export const createUiFacts = (input: {
  working: WorkingState
  reset: boolean
}): EditorSceneUiFacts => input.reset
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

export const createRenderFacts = (input: {
  current: Input
  working: WorkingState
  reset: boolean
}): EditorSceneRenderFacts => {
  if (input.reset) {
    return {
      node: 'all',
      edgeStatics: 'all',
      edgeActive: 'all',
      edgeLabels: 'all',
      edgeMasks: 'all',
      chromeScene: true,
      chromeEdge: true
    }
  }

  const graphFacts = input.working.facts.graph
  const runtimeFacts = input.current.runtime.facts
  const uiFacts = input.working.facts.ui
  const node = new Set<NodeId>()
  const edgeStatics = new Set<EdgeId>()
  const edgeLabels = new Set<EdgeId>()
  const edgeMasks = new Set<EdgeId>()
  const edgeActive = new Set<EdgeId>([
    ...runtimeFacts.activeEdgeIds,
    ...input.working.render.active.keys()
  ])

  appendIds(node, graphFacts.node.entity as ReadonlySet<NodeId>)
  appendIds(node, graphFacts.node.geometry as ReadonlySet<NodeId>)
  appendIds(node, graphFacts.node.content as ReadonlySet<NodeId>)
  appendIds(node, graphFacts.node.owner as ReadonlySet<NodeId>)
  if (uiFacts.node !== 'all') {
    appendIds(node, uiFacts.node)
  }
  appendMindmapNodeScope({
    target: node,
    scope: graphFacts.mindmap.entity,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphFacts.mindmap.geometry,
    working: input.working
  })
  appendMindmapNodeScope({
    target: node,
    scope: graphFacts.mindmap.owner,
    working: input.working
  })
  appendIds(node, runtimeFacts.touchedNodeIds)

  appendIds(edgeStatics, graphFacts.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeStatics, graphFacts.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeStatics, graphFacts.edge.content as ReadonlySet<EdgeId>)
  appendEdgeItemScope({
    target: edgeStatics,
    scope: input.working.facts.items.touched,
    working: input.working
  })

  appendIds(edgeLabels, graphFacts.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeLabels, graphFacts.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeLabels, graphFacts.edge.content as ReadonlySet<EdgeId>)
  if (uiFacts.edge !== 'all') {
    appendIds(edgeLabels, uiFacts.edge)
  }

  appendIds(edgeMasks, graphFacts.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeMasks, graphFacts.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeMasks, graphFacts.edge.content as ReadonlySet<EdgeId>)

  appendIds(edgeActive, graphFacts.edge.entity as ReadonlySet<EdgeId>)
  appendIds(edgeActive, graphFacts.edge.geometry as ReadonlySet<EdgeId>)
  appendIds(edgeActive, graphFacts.edge.content as ReadonlySet<EdgeId>)
  if (uiFacts.edge !== 'all') {
    appendIds(edgeActive, uiFacts.edge)
  }

  return {
    node: toScope(node),
    edgeStatics: toScope(edgeStatics),
    edgeActive: toScope(edgeActive),
    edgeLabels: toScope(edgeLabels),
    edgeMasks: toScope(edgeMasks),
    chromeScene: uiFacts.chrome,
    chromeEdge: (
      runtimeFacts.uiChanged
      || uiFacts.chrome
      || sceneScopeHasAny(uiFacts.edge)
      || sceneScopeHasAny(graphFacts.edge.entity)
      || sceneScopeHasAny(graphFacts.edge.geometry)
      || sceneScopeHasAny(graphFacts.edge.content)
    )
  }
}
