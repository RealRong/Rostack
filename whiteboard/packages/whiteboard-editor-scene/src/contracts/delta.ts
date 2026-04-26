import {
  defineScope,
  flag,
  set
} from '@shared/projector/phase'
import type {
  IdDelta as SharedIdDelta
} from '@shared/projector/delta'
import { idDelta } from '@shared/projector/delta'
import type { Revision } from '@shared/projector/phase'
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

export const graphPhaseScope = defineScope({
  reset: flag(),
  order: flag(),
  nodes: set<NodeId>(),
  edges: set<EdgeId>(),
  mindmaps: set<MindmapId>(),
  groups: set<GroupId>()
})

export const spatialPhaseScope = defineScope({
  reset: flag(),
  graph: flag()
})

export const viewPhaseScope = defineScope({
  reset: flag(),
  chrome: flag(),
  items: flag(),
  nodes: set<NodeId>(),
  edges: set<EdgeId>(),
  statics: set<EdgeId>(),
  labels: set<EdgeId>(),
  active: set<EdgeId>(),
  masks: set<EdgeId>(),
  overlay: flag()
})

export interface EditorPhaseScopeMap {
  graph: typeof graphPhaseScope
  spatial: typeof spatialPhaseScope
  view: typeof viewPhaseScope
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
