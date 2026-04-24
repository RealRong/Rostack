import type {
  IdDelta as SharedIdDelta,
  KeySet
} from '@shared/projector/delta'
import type { Revision } from '@shared/projector'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  SpatialKey
} from '../domain/spatial/contracts'
import type { SpatialPatchScope } from '../projector/scopes/spatialScope'

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

export interface GraphPublishDelta {
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  owners: {
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
}

export interface UiPublishDelta {
  chrome: boolean
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
}

export interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: KeySet<NodeId>
  edges: KeySet<EdgeId>
  mindmaps: KeySet<MindmapId>
  groups: KeySet<GroupId>
}

export interface UiPatchScope {
  reset: boolean
  chrome: boolean
  nodes: KeySet<NodeId>
  edges: KeySet<EdgeId>
}

export interface EditorPhaseScopeMap {
  graph: GraphPatchScope
  spatial: SpatialPatchScope
  ui: UiPatchScope
  items: undefined
}
