import type * as document from '@whiteboard/engine/contracts/document'
import type {
  EdgeId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  GraphDelta,
  IdDelta,
  SpatialDelta
} from '../../contracts/delta'
import type { GraphState } from '../../contracts/working'
import {
  markAdded,
  markRemoved,
  markUpdated
} from '../graphPatch/delta'
import {
  readEdgeSpatialRecord,
  readMindmapSpatialRecord,
  readNodeSpatialRecord,
  readSceneOrder
} from './records'
import type {
  SpatialKey,
  SpatialPatchScope,
  SpatialRecord
} from './contracts'
import type { SpatialIndexState } from './state'
import { resetSpatialState } from './state'

const createIdDelta = <TId extends string>(): IdDelta<TId> => ({
  added: new Set(),
  updated: new Set(),
  removed: new Set()
})

const resetIdDelta = <TId extends string>(
  delta: IdDelta<TId>
) => {
  delta.added.clear()
  delta.updated.clear()
  delta.removed.clear()
}

const isSpatialRecordEqual = (
  left: SpatialRecord,
  right: SpatialRecord
): boolean => (
  left.key === right.key
  && left.kind === right.kind
  && left.item.kind === right.item.kind
  && left.item.id === right.item.id
  && left.order === right.order
  && left.bounds.x === right.bounds.x
  && left.bounds.y === right.bounds.y
  && left.bounds.width === right.bounds.width
  && left.bounds.height === right.bounds.height
)

const hasIdDelta = <TId extends string>(
  delta: IdDelta<TId>
): boolean => (
  delta.added.size > 0
  || delta.updated.size > 0
  || delta.removed.size > 0
)

const collectRecordIds = <TId extends string>(
  ...sources: readonly ReadonlySet<TId>[]
): readonly TId[] => [...new Set(
  sources.flatMap((source) => [...source])
)]

const patchNodeRecord = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  state: SpatialIndexState
  delta: IdDelta<SpatialKey>
  nodeId: NodeId
}) => patchSpatialRecord({
  state: input.state,
  key: `node:${input.nodeId}` as SpatialKey,
  next: readNodeSpatialRecord({
    graph: input.graph,
    snapshot: input.snapshot,
    nodeId: input.nodeId
  }),
  delta: input.delta
})

const patchEdgeRecord = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  state: SpatialIndexState
  delta: IdDelta<SpatialKey>
  edgeId: EdgeId
}) => patchSpatialRecord({
  state: input.state,
  key: `edge:${input.edgeId}` as SpatialKey,
  next: readEdgeSpatialRecord({
    graph: input.graph,
    snapshot: input.snapshot,
    edgeId: input.edgeId
  }),
  delta: input.delta
})

const patchMindmapRecord = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  state: SpatialIndexState
  delta: IdDelta<SpatialKey>
  mindmapId: MindmapId
}) => patchSpatialRecord({
  state: input.state,
  key: `mindmap:${input.mindmapId}` as SpatialKey,
  next: readMindmapSpatialRecord({
    graph: input.graph,
    snapshot: input.snapshot,
    mindmapId: input.mindmapId
  }),
  delta: input.delta
})

const rebuildSpatialRecords = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  state: SpatialIndexState
  delta: IdDelta<SpatialKey>
}): number => {
  let count = 0

  input.graph.nodes.forEach((_view, nodeId) => {
    if (patchNodeRecord({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta,
      nodeId
    }) !== 'unchanged') {
      count += 1
    }
  })

  input.graph.edges.forEach((_view, edgeId) => {
    if (patchEdgeRecord({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta,
      edgeId
    }) !== 'unchanged') {
      count += 1
    }
  })

  input.graph.owners.mindmaps.forEach((_view, mindmapId) => {
    if (patchMindmapRecord({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta,
      mindmapId
    }) !== 'unchanged') {
      count += 1
    }
  })

  return count
}

const patchGraphRecords = (input: {
  graph: GraphState
  snapshot: document.Snapshot
  graphDelta: GraphDelta
  state: SpatialIndexState
  delta: IdDelta<SpatialKey>
}): number => {
  let count = 0

  collectRecordIds(
    input.graphDelta.entities.nodes.added,
    input.graphDelta.entities.nodes.removed,
    input.graphDelta.geometry.nodes
  ).forEach((nodeId) => {
    if (patchNodeRecord({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta,
      nodeId
    }) !== 'unchanged') {
      count += 1
    }
  })

  collectRecordIds(
    input.graphDelta.entities.edges.added,
    input.graphDelta.entities.edges.removed,
    input.graphDelta.geometry.edges
  ).forEach((edgeId) => {
    if (patchEdgeRecord({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta,
      edgeId
    }) !== 'unchanged') {
      count += 1
    }
  })

  collectRecordIds(
    input.graphDelta.entities.mindmaps.added,
    input.graphDelta.entities.mindmaps.removed,
    input.graphDelta.geometry.mindmaps
  ).forEach((mindmapId) => {
    if (patchMindmapRecord({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta,
      mindmapId
    }) !== 'unchanged') {
      count += 1
    }
  })

  return count
}

export const createSpatialDelta = (): SpatialDelta => ({
  revision: 0,
  order: false,
  records: createIdDelta<SpatialKey>(),
  visible: false
})

export const resetSpatialDelta = (
  delta: SpatialDelta
) => {
  delta.revision = 0
  delta.order = false
  resetIdDelta(delta.records)
  delta.visible = false
}

export type SpatialPatchAction =
  | 'unchanged'
  | 'added'
  | 'updated'
  | 'removed'

export const patchSpatialRecord = (input: {
  state: SpatialIndexState
  key: SpatialKey
  next: SpatialRecord | undefined
  delta: IdDelta<SpatialKey>
}): SpatialPatchAction => {
  const previous = input.state.records.get(input.key)
  if (!previous && !input.next) {
    return 'unchanged'
  }

  if (!input.next) {
    input.state.records.delete(input.key)
    input.state.tree.remove(previous!)
    markRemoved(input.delta, input.key)
    return 'removed'
  }

  if (!previous) {
    input.state.records.set(input.key, input.next)
    input.state.tree.insert(input.next)
    markAdded(input.delta, input.key)
    return 'added'
  }

  if (isSpatialRecordEqual(previous, input.next)) {
    return 'unchanged'
  }

  input.state.records.set(input.key, input.next)
  input.state.tree.update(previous, input.next)
  markUpdated(input.delta, input.key)
  return 'updated'
}

export const patchSpatialOrder = (input: {
  state: SpatialIndexState
  snapshot: document.Snapshot
  delta: SpatialDelta
}): void => {
  input.delta.order = true

  input.state.records.forEach((record, key) => {
    const nextOrder = readSceneOrder(input.snapshot, record.item)
    if (record.order === nextOrder) {
      return
    }

    input.state.records.set(key, {
      ...record,
      order: nextOrder
    })
  })
}

export const markSpatialVisibleDirty = (input: {
  state: SpatialIndexState
  delta: SpatialDelta
}) => {
  input.state.visible.dirty = true
  input.delta.visible = true
}

export const patchSpatial = (input: {
  revision: number
  graph: GraphState
  snapshot: document.Snapshot
  graphDelta: GraphDelta
  state: SpatialIndexState
  scope: SpatialPatchScope
  delta: SpatialDelta
}): {
  changed: boolean
  count: number
} => {
  let count = 0

  resetSpatialDelta(input.delta)
  input.delta.revision = input.revision

  if (input.scope.reset) {
    resetSpatialState(input.state)
    count += rebuildSpatialRecords({
      graph: input.graph,
      snapshot: input.snapshot,
      state: input.state,
      delta: input.delta.records
    })
  } else if (input.scope.graph) {
    count += patchGraphRecords({
      graph: input.graph,
      snapshot: input.snapshot,
      graphDelta: input.graphDelta,
      state: input.state,
      delta: input.delta.records
    })
  }

  if ((input.scope.reset || input.scope.graph) && input.graphDelta.order) {
    patchSpatialOrder({
      state: input.state,
      snapshot: input.snapshot,
      delta: input.delta
    })
  }

  if (input.scope.visible || hasIdDelta(input.delta.records) || input.delta.order) {
    markSpatialVisibleDirty({
      state: input.state,
      delta: input.delta
    })
  }

  return {
    changed: hasIdDelta(input.delta.records) || input.delta.order || input.delta.visible,
    count
  }
}
