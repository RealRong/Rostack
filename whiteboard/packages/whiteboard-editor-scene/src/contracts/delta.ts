import {
  change,
  idDelta,
  type EntityDelta,
  type IdDelta as SharedIdDelta
} from '@shared/delta'
import { key } from '@shared/spec'
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

export const graphChangeSpec = {
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
} as const

export const graphChange = change<typeof graphChangeSpec, {
  ids: {
    'node.lifecycle': NodeId
    'node.geometry': NodeId
    'node.content': NodeId
    'node.owner': NodeId
    'edge.lifecycle': EdgeId
    'edge.route': EdgeId
    'edge.style': EdgeId
    'edge.labels': EdgeId
    'edge.endpoints': EdgeId
    'edge.box': EdgeId
    'mindmap.lifecycle': MindmapId
    'mindmap.geometry': MindmapId
    'mindmap.connectors': MindmapId
    'mindmap.membership': MindmapId
    'group.lifecycle': GroupId
    'group.geometry': GroupId
    'group.membership': GroupId
  }
}>(graphChangeSpec)

export type GraphChanges = ReturnType<typeof graphChange.create>

export type SceneItemKey =
  | `mindmap:${MindmapId}`
  | `node:${NodeId}`
  | `edge:${EdgeId}`

export const sceneItemKey = key.tagged(['mindmap', 'node', 'edge'] as const)

export type SceneItemEntry = SceneItem & {
  key: SceneItemKey
}

export interface ItemsDelta {
  revision: Revision
  change?: EntityDelta<SceneItemKey>
}

export const uiChangeSpec = {
  node: 'ids',
  edge: 'ids',
  chrome: 'flag'
} as const

export const uiChange = change<typeof uiChangeSpec, {
  ids: {
    node: NodeId
    edge: EdgeId
  }
}>(uiChangeSpec)

export type UiDelta = ReturnType<typeof uiChange.create>

export const renderChangeSpec = {
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
} as const

export const renderChange = change<typeof renderChangeSpec, {
  ids: {
    node: NodeId
    'edge.statics': EdgeStaticId
    'edge.active': EdgeId
    'edge.labels': EdgeLabelKey
    'edge.masks': EdgeId
  }
}>(renderChangeSpec)

export type RenderDelta = ReturnType<typeof renderChange.create>

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

export const createItemsDelta = (): ItemsDelta => ({
  revision: 0
})
