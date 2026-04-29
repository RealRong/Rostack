import {
  change,
  idDelta,
  type EntityDelta,
  type IdDelta as SharedIdDelta
} from '@shared/delta'
import { key } from '@shared/spec'
import type { Revision } from '@shared/projection'
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
