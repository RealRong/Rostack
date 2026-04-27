import {
  createChangeState,
  idDelta,
  type ChangeSchema,
  type EntityDelta,
  type IdDelta as SharedIdDelta
} from '@shared/delta'
import type {
  Revision,
  ScopeInputValue,
  ScopeSchema,
  ScopeValue
} from '@shared/projection'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { EdgeLabelKey, EdgeStaticId } from './render'
import type { SceneItem } from './editor'
import type { SpatialKey } from '../model/spatial/contracts'

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

export interface GraphChanges {
  order: boolean
  node: {
    lifecycle: IdDelta<NodeId>
    geometry: IdDelta<NodeId>
    content: IdDelta<NodeId>
    owner: IdDelta<NodeId>
  }
  edge: {
    lifecycle: IdDelta<EdgeId>
    route: IdDelta<EdgeId>
    style: IdDelta<EdgeId>
    labels: IdDelta<EdgeId>
    endpoints: IdDelta<EdgeId>
    box: IdDelta<EdgeId>
  }
  mindmap: {
    lifecycle: IdDelta<MindmapId>
    geometry: IdDelta<MindmapId>
    connectors: IdDelta<MindmapId>
    membership: IdDelta<MindmapId>
  }
  group: {
    lifecycle: IdDelta<GroupId>
    geometry: IdDelta<GroupId>
    membership: IdDelta<GroupId>
  }
}

export const graphChangeSpec: ChangeSchema<GraphChanges> = {
  order: 'flag',
  node: {
    lifecycle: 'ids',
    geometry: 'ids',
    content: 'ids',
    owner: 'ids'
  },
  edge: {
    lifecycle: 'ids',
    route: 'ids',
    style: 'ids',
    labels: 'ids',
    endpoints: 'ids',
    box: 'ids'
  },
  mindmap: {
    lifecycle: 'ids',
    geometry: 'ids',
    connectors: 'ids',
    membership: 'ids'
  },
  group: {
    lifecycle: 'ids',
    geometry: 'ids',
    membership: 'ids'
  }
}

export type SceneItemKey =
  | `mindmap:${MindmapId}`
  | `node:${NodeId}`
  | `edge:${EdgeId}`

export type SceneItemEntry = SceneItem & {
  key: SceneItemKey
}

export interface ItemsDelta {
  revision: Revision
  change?: EntityDelta<SceneItemKey>
}

export interface UiDelta {
  node: IdDelta<NodeId>
  edge: IdDelta<EdgeId>
  chrome: boolean
}

export const uiChangeSpec: ChangeSchema<UiDelta> = {
  node: 'ids',
  edge: 'ids',
  chrome: 'flag'
}

export interface RenderDelta {
  node: IdDelta<NodeId>
  edge: {
    statics: IdDelta<EdgeStaticId>
    active: IdDelta<EdgeId>
    labels: IdDelta<EdgeLabelKey>
    masks: IdDelta<EdgeId>
    staticsIds: boolean
    activeIds: boolean
    labelsIds: boolean
    masksIds: boolean
  }
  chrome: {
    scene: boolean
    edge: boolean
  }
}

export const renderChangeSpec: ChangeSchema<RenderDelta> = {
  node: 'ids',
  edge: {
    statics: 'ids',
    active: 'ids',
    labels: 'ids',
    masks: 'ids',
    staticsIds: 'flag',
    activeIds: 'flag',
    labelsIds: 'flag',
    masksIds: 'flag'
  },
  chrome: {
    scene: 'flag',
    edge: 'flag'
  }
}

export interface SpatialDelta {
  revision: Revision
  order: boolean
  records: IdDelta<SpatialKey>
}

export interface GraphPatchScope {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  mindmaps: ReadonlySet<MindmapId>
  groups: ReadonlySet<GroupId>
}

export interface SpatialPatchScope {
  reset: boolean
  graph: boolean
}

export interface ItemsPatchScope {
  reset: boolean
  graph: boolean
}

export interface UiPatchScope {
  reset: boolean
  nodes: ReadonlySet<NodeId>
  edges: ReadonlySet<EdgeId>
  chrome: boolean
}

export interface RenderPatchScope {
  reset: boolean
  node: boolean
  statics: boolean
  active: boolean
  labels: boolean
  masks: boolean
  overlay: boolean
  chrome: boolean
}

export const graphPhaseScope = {
  reset: 'flag',
  order: 'flag',
  nodes: 'set',
  edges: 'set',
  mindmaps: 'set',
  groups: 'set'
} satisfies ScopeSchema<GraphPatchScope>

export const spatialPhaseScope = {
  reset: 'flag',
  graph: 'flag'
} satisfies ScopeSchema<SpatialPatchScope>

export const itemsPhaseScope = {
  reset: 'flag',
  graph: 'flag'
} satisfies ScopeSchema<ItemsPatchScope>

export const uiPhaseScope = {
  reset: 'flag',
  nodes: 'set',
  edges: 'set',
  chrome: 'flag'
} satisfies ScopeSchema<UiPatchScope>

export const renderPhaseScope = {
  reset: 'flag',
  node: 'flag',
  statics: 'flag',
  active: 'flag',
  labels: 'flag',
  masks: 'flag',
  overlay: 'flag',
  chrome: 'flag'
} satisfies ScopeSchema<RenderPatchScope>

export type EditorPhaseScopeMap = {
  graph: GraphPatchScope
  spatial: SpatialPatchScope
  items: ItemsPatchScope
  ui: UiPatchScope
  render: RenderPatchScope
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

export const createGraphChanges = (): GraphChanges => createChangeState(
  graphChangeSpec
)

export const createUiDelta = (): UiDelta => createChangeState(uiChangeSpec)

export const createRenderDelta = (): RenderDelta => createChangeState(
  renderChangeSpec
)

export const createItemsDelta = (): ItemsDelta => ({
  revision: 0
})
