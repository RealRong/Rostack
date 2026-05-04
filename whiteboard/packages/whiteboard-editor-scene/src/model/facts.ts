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
  input: {
    current: Input
    runtimeFacts: WorkingState['runtime']['editor']['facts']
  }
): EditorSceneInputFacts => {
  const { current, runtimeFacts } = input
  const nodeTargets = sceneScopeUnion(
    current.change.node.create.touchedIds(),
    current.change.node.delete.touchedIds(),
    current.change.node.geometry.touchedIds(),
    current.change.node.owner.touchedIds(),
    current.change.node.content.touchedIds()
  )
  const edgeTargets = sceneScopeUnion(
    current.change.edge.create.touchedIds(),
    current.change.edge.delete.touchedIds(),
    current.change.edge.endpoints.touchedIds(),
    current.change.edge.points.touchedIds(),
    current.change.edge.style.touchedIds(),
    current.change.edge.labels.touchedIds(),
    current.change.edge.data.touchedIds()
  )
  const mindmapTargets = sceneScopeUnion(
    current.change.mindmap.create.touchedIds(),
    current.change.mindmap.delete.touchedIds(),
    current.change.mindmap.structure.touchedIds(),
    current.change.mindmap.layout.touchedIds()
  )
  const groupTargets = sceneScopeUnion(
    current.change.group.create.touchedIds(),
    current.change.group.delete.touchedIds(),
    current.change.group.value.touchedIds()
  )

  const reset = current.change.reset()
    || nodeTargets === 'all'
    || edgeTargets === 'all'
    || mindmapTargets === 'all'
    || groupTargets === 'all'
  const order = reset || current.change.order.changed()

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

  appendIds(nodeTargetIds, Object.keys(current.editor.snapshot.preview.node))
  appendIds(edgeTargetIds, Object.keys(current.editor.snapshot.preview.edge))
  Object.keys(current.editor.snapshot.preview.mindmap).forEach((mindmapId) => {
    mindmapTargetIds.add(mindmapId)
  })

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

  const editingNode = input.current.editor.snapshot.state.edit?.kind === 'node'
    ? sceneScopeFromValues([input.current.editor.snapshot.state.edit.nodeId])
    : new Set<string>()
  const editingEdge = input.current.editor.snapshot.state.edit?.kind === 'edge-label'
    ? sceneScopeFromValues([input.current.editor.snapshot.state.edit.edgeId])
    : new Set<string>()

  return {
    node: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.nodes),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.nodes),
      content: sceneScopeUnion(
        scopeFromTouchedIds(input.current.change.node.content.touchedIds()),
        editingNode
      ),
      owner: scopeFromTouchedIds(input.current.change.node.owner.touchedIds())
    },
    edge: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.edges),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.edges),
      content: sceneScopeUnion(
        scopeFromTouchedIds(input.current.change.edge.labels.touchedIds()),
        scopeFromTouchedIds(input.current.change.edge.style.touchedIds()),
        scopeFromTouchedIds(input.current.change.edge.data.touchedIds()),
        editingEdge
      )
    },
    mindmap: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.mindmaps),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.mindmaps),
      owner: scopeFromTouchedIds(input.current.change.mindmap.structure.touchedIds())
    },
    group: {
      entity: sceneScopeFromIdDelta(input.working.phase.graph.entities.groups),
      geometry: sceneScopeFromValues(input.working.phase.graph.geometry.groups),
      owner: scopeFromTouchedIds(input.current.change.group.value.touchedIds())
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

  const runtimeFacts = input.working.runtime.editor.facts
  const graphFacts = input.working.facts.graph
  const node = new Set<string>()
  const edge = new Set<string>()
  let chrome = runtimeFacts.uiChanged

  if (graphFacts.node.entity !== 'all') appendIds(node, graphFacts.node.entity)
  if (graphFacts.node.geometry !== 'all') appendIds(node, graphFacts.node.geometry)
  if (graphFacts.node.content !== 'all') appendIds(node, graphFacts.node.content)
  if (graphFacts.node.owner !== 'all') appendIds(node, graphFacts.node.owner)
  if (graphFacts.edge.entity !== 'all') appendIds(edge, graphFacts.edge.entity)
  if (graphFacts.edge.geometry !== 'all') appendIds(edge, graphFacts.edge.geometry)
  if (graphFacts.edge.content !== 'all') appendIds(edge, graphFacts.edge.content)
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
  const runtimeFacts = input.working.runtime.editor.facts
  const uiFacts = input.working.facts.ui
  const node = new Set<string>()
  const edgeStatics = new Set<string>()
  const edgeLabels = new Set<string>()
  const edgeMasks = new Set<string>()
  const edgeActive = new Set<string>([
    ...runtimeFacts.activeEdgeIds,
    ...input.working.render.active.keys()
  ])

  if (graphFacts.node.entity !== 'all') appendIds(node, graphFacts.node.entity)
  if (graphFacts.node.geometry !== 'all') appendIds(node, graphFacts.node.geometry)
  if (graphFacts.node.content !== 'all') appendIds(node, graphFacts.node.content)
  if (graphFacts.node.owner !== 'all') appendIds(node, graphFacts.node.owner)
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

  if (graphFacts.edge.entity !== 'all') appendIds(edgeStatics, graphFacts.edge.entity)
  if (graphFacts.edge.geometry !== 'all') appendIds(edgeStatics, graphFacts.edge.geometry)
  if (graphFacts.edge.content !== 'all') appendIds(edgeStatics, graphFacts.edge.content)
  appendEdgeItemScope({
    target: edgeStatics,
    scope: input.working.facts.items.touched,
    working: input.working
  })

  if (graphFacts.edge.entity !== 'all') appendIds(edgeLabels, graphFacts.edge.entity)
  if (graphFacts.edge.geometry !== 'all') appendIds(edgeLabels, graphFacts.edge.geometry)
  if (graphFacts.edge.content !== 'all') appendIds(edgeLabels, graphFacts.edge.content)
  if (uiFacts.edge !== 'all') {
    appendIds(edgeLabels, uiFacts.edge)
  }

  if (graphFacts.edge.entity !== 'all') appendIds(edgeMasks, graphFacts.edge.entity)
  if (graphFacts.edge.geometry !== 'all') appendIds(edgeMasks, graphFacts.edge.geometry)
  if (graphFacts.edge.content !== 'all') appendIds(edgeMasks, graphFacts.edge.content)

  if (graphFacts.edge.entity !== 'all') appendIds(edgeActive, graphFacts.edge.entity)
  if (graphFacts.edge.geometry !== 'all') appendIds(edgeActive, graphFacts.edge.geometry)
  if (graphFacts.edge.content !== 'all') appendIds(edgeActive, graphFacts.edge.content)
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
