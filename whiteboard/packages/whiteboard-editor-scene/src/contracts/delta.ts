import type {
  IdDelta as SharedIdDelta
} from '@shared/delta'
import { idDelta } from '@shared/delta'
import {
  createFlagScopeField,
  createScopeSchema,
  createSetScopeField,
  type InternalScopeInputValue as ScopeInputValue,
  type InternalScopeValue as ScopeValue
} from '@shared/projection/internal'
import type { Revision } from '@shared/projection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  SpatialKey
} from '../model/spatial/contracts'

export type IdDelta<TId extends string> = SharedIdDelta<TId>

export interface GraphDelta {
  revision: Revision
  order: boolean
  entities: {
    nodes: IdDelta<NodeId>
    edges: IdDelta<EdgeId>
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
  geometry: {
    nodes: Set<NodeId>
    edges: Set<EdgeId>
    mindmaps: Set<MindmapId>
    groups: Set<GroupId>
  }
}

export interface SpatialDelta {
  revision: Revision
  order: boolean
  records: IdDelta<SpatialKey>
}

export interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

export interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}

export interface ViewPatchScope {
  reset: boolean
  chrome: boolean
  items: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  statics: ReadonlySet<EdgeId>
  labels: ReadonlySet<EdgeId>
  active: ReadonlySet<EdgeId>
  masks: ReadonlySet<EdgeId>
  overlay: boolean
}

export const graphPhaseScope = createScopeSchema({
  reset: createFlagScopeField(),
  order: createFlagScopeField(),
  nodes: createSetScopeField<NodeId>(),
  edges: createSetScopeField<EdgeId>(),
  mindmaps: createSetScopeField<MindmapId>(),
  groups: createSetScopeField<GroupId>()
})

export const spatialPhaseScope = createScopeSchema({
  reset: createFlagScopeField(),
  graph: createFlagScopeField()
})

export const viewPhaseScope = createScopeSchema({
  reset: createFlagScopeField(),
  chrome: createFlagScopeField(),
  items: createFlagScopeField(),
  nodes: createSetScopeField<NodeId>(),
  edges: createSetScopeField<EdgeId>(),
  statics: createSetScopeField<EdgeId>(),
  labels: createSetScopeField<EdgeId>(),
  active: createSetScopeField<EdgeId>(),
  masks: createSetScopeField<EdgeId>(),
  overlay: createFlagScopeField()
})

export interface EditorPhaseScopeMap {
  graph: typeof graphPhaseScope
  spatial: typeof spatialPhaseScope
  view: typeof viewPhaseScope
}

export type {
  ScopeInputValue,
  ScopeValue
}

export const createGraphDelta = (): GraphDelta => ({
  revision: 0,
  order: false,
  entities: {
    nodes: idDelta.create<NodeId>(),
    edges: idDelta.create<EdgeId>(),
    mindmaps: idDelta.create<MindmapId>(),
    groups: idDelta.create<GroupId>()
  },
  geometry: {
    nodes: new Set(),
    edges: new Set(),
    mindmaps: new Set(),
    groups: new Set()
  }
})

export const resetGraphDelta = (
  delta: GraphDelta
) => {
  delta.revision = 0
  delta.order = false
  idDelta.reset(delta.entities.nodes)
  idDelta.reset(delta.entities.edges)
  idDelta.reset(delta.entities.mindmaps)
  idDelta.reset(delta.entities.groups)
  delta.geometry.nodes.clear()
  delta.geometry.edges.clear()
  delta.geometry.mindmaps.clear()
  delta.geometry.groups.clear()
}
