import type { KeySet } from '@shared/core'
import type {
  Revision,
} from '@shared/projection-runtime'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  SpatialKey,
  SpatialPatchScope
} from '../runtime/spatial/contracts'

export interface IdDelta<TId extends string> {
  added: Set<TId>
  updated: Set<TId>
  removed: Set<TId>
}

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
  visible: boolean
}

export interface PublishDelta {
  graph: GraphPublishDelta
  scene: ScenePublishDelta
  ui: UiPublishDelta
}

export interface GraphPublishDelta {
  nodes: IdDelta<NodeId>
  edges: IdDelta<EdgeId>
  owners: {
    mindmaps: IdDelta<MindmapId>
    groups: IdDelta<GroupId>
  }
}

export interface ScenePublishDelta {
  items: boolean
  visible: boolean
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

export interface EditorPhaseScopeMap {
  graph: GraphPatchScope
  spatial: SpatialPatchScope
  ui: undefined
  scene: undefined
}
