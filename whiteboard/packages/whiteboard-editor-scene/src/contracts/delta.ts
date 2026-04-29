import {
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

export interface DocumentDelta {
  revision: boolean
  background: boolean
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

export interface UiDelta {
  node: IdDelta<NodeId>
  edge: IdDelta<EdgeId>
  chrome: boolean
}

const createUiDelta = (): UiDelta => ({
  node: idDelta.create<NodeId>(),
  edge: idDelta.create<EdgeId>(),
  chrome: false
})

export const uiChange = {
  create: createUiDelta
} as const

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

const createRenderDelta = (): RenderDelta => ({
  node: idDelta.create<NodeId>(),
  edge: {
    statics: idDelta.create<EdgeStaticId>(),
    active: idDelta.create<EdgeId>(),
    labels: idDelta.create<EdgeLabelKey>(),
    masks: idDelta.create<EdgeId>(),
    staticsIds: false,
    activeIds: false,
    labelsIds: false,
    masksIds: false
  },
  chrome: {
    scene: false,
    edge: false
  }
})

export const renderChange = {
  create: createRenderDelta
} as const

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

export const createDocumentDelta = (): DocumentDelta => ({
  revision: false,
  background: false
})

export const resetDocumentDelta = (
  delta: DocumentDelta
) => {
  delta.revision = false
  delta.background = false
}

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
