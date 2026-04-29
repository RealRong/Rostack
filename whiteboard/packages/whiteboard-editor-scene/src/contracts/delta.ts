import {
  idDelta,
  type EntityDelta,
  type IdDelta as SharedIdDelta
} from '@shared/delta'
import { key } from '@shared/spec'
import type {
  ProjectionFamilyChange,
  ProjectionFamilySnapshot,
  ProjectionValueChange,
  Revision
} from '@shared/projection'
import type {
  Document as WhiteboardDocument,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type {
  ChromeStateView,
  EdgeStateView,
  EdgeView,
  GroupView,
  MindmapView,
  NodeStateView,
  NodeView
} from './editor'
import type { EdgeLabelKey, EdgeStaticId } from './render'
import type {
  ChromeRenderView,
  EdgeActiveView,
  EdgeLabelView,
  EdgeMaskView,
  EdgeOverlayView,
  EdgeStaticView,
  NodeRenderView
} from './render'
import type { SceneItem } from './editor'
import type { SpatialKey } from '../model/spatial/contracts'

export type IdDelta<TId extends string> = SharedIdDelta<TId>

export interface GraphPhaseDelta {
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

export interface UiPhaseDelta {
  node: IdDelta<NodeId>
  edge: IdDelta<EdgeId>
  chrome: boolean
}

const createUiPhaseDelta = (): UiPhaseDelta => ({
  node: idDelta.create<NodeId>(),
  edge: idDelta.create<EdgeId>(),
  chrome: false
})

export interface RenderPhaseDelta {
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

const createRenderPhaseDelta = (): RenderPhaseDelta => ({
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

export interface SpatialDelta {
  revision: Revision
  order: boolean
  records: IdDelta<SpatialKey>
}

export interface DocumentDelta {
  revision: ProjectionValueChange<Revision>
  background: ProjectionValueChange<WhiteboardDocument['background'] | undefined>
}

export interface GraphDelta {
  node: ProjectionFamilyChange<NodeId, NodeView>
  edge: ProjectionFamilyChange<EdgeId, EdgeView>
  mindmap: ProjectionFamilyChange<MindmapId, MindmapView>
  group: ProjectionFamilyChange<GroupId, GroupView>
  state: {
    node: ProjectionFamilyChange<NodeId, NodeStateView>
    edge: ProjectionFamilyChange<EdgeId, EdgeStateView>
    chrome: ProjectionValueChange<ChromeStateView>
  }
}

export interface RenderDelta {
  node: ProjectionFamilyChange<NodeId, NodeRenderView>
  edge: {
    statics: ProjectionFamilyChange<EdgeStaticId, EdgeStaticView>
    active: ProjectionFamilyChange<EdgeId, EdgeActiveView>
    labels: ProjectionFamilyChange<EdgeLabelKey, EdgeLabelView>
    masks: ProjectionFamilyChange<EdgeId, EdgeMaskView>
  }
  chrome: {
    scene: ProjectionValueChange<ChromeRenderView>
    edge: ProjectionValueChange<EdgeOverlayView>
  }
}

export interface DeltaState {
  document: DocumentDelta
  graph: GraphDelta
  render: RenderDelta
  items: ProjectionFamilyChange<SceneItemKey, SceneItem>
}

export const createGraphPhaseDelta = (): GraphPhaseDelta => ({
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
  revision: 'skip',
  background: 'skip'
})

export const createGraphDelta = (): GraphDelta => ({
  node: 'skip',
  edge: 'skip',
  mindmap: 'skip',
  group: 'skip',
  state: {
    node: 'skip',
    edge: 'skip',
    chrome: 'skip'
  }
})

export const resetGraphPhaseDelta = (
  delta: GraphPhaseDelta
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

export const createUiPhaseDeltaState = (): UiPhaseDelta => createUiPhaseDelta()

export const createRenderDelta = (): RenderDelta => ({
  node: 'skip',
  edge: {
    statics: 'skip',
    active: 'skip',
    labels: 'skip',
    masks: 'skip'
  },
  chrome: {
    scene: 'skip',
    edge: 'skip'
  }
})

export const createRenderPhaseDeltaState = (): RenderPhaseDelta => createRenderPhaseDelta()

export const createDeltaState = (): DeltaState => ({
  document: createDocumentDelta(),
  graph: createGraphDelta(),
  render: createRenderDelta(),
  items: 'skip'
})

export const resetDocumentDelta = (
  delta: DocumentDelta
) => {
  delta.revision = 'skip'
  delta.background = 'skip'
}

export const resetGraphDelta = (
  delta: GraphDelta
) => {
  delta.node = 'skip'
  delta.edge = 'skip'
  delta.mindmap = 'skip'
  delta.group = 'skip'
  delta.state.node = 'skip'
  delta.state.edge = 'skip'
  delta.state.chrome = 'skip'
}

export const resetUiPhaseDelta = (
  delta: UiPhaseDelta
) => {
  idDelta.reset(delta.node)
  idDelta.reset(delta.edge)
  delta.chrome = false
}

export const resetRenderDelta = (
  delta: RenderDelta
) => {
  delta.node = 'skip'
  delta.edge.statics = 'skip'
  delta.edge.active = 'skip'
  delta.edge.labels = 'skip'
  delta.edge.masks = 'skip'
  delta.chrome.scene = 'skip'
  delta.chrome.edge = 'skip'
}

export const resetRenderPhaseDelta = (
  delta: RenderPhaseDelta
) => {
  idDelta.reset(delta.node)
  idDelta.reset(delta.edge.statics)
  idDelta.reset(delta.edge.active)
  idDelta.reset(delta.edge.labels)
  idDelta.reset(delta.edge.masks)
  delta.edge.staticsIds = false
  delta.edge.activeIds = false
  delta.edge.labelsIds = false
  delta.edge.masksIds = false
  delta.chrome.scene = false
  delta.chrome.edge = false
}

export const compileValueChange = <TValue>(
  changed: boolean,
  value: TValue
): ProjectionValueChange<TValue> => changed
  ? {
      value
    }
  : 'skip'

export const compileFamilyChangeFromIdDelta = <TKey extends string, TValue>(input: {
  snapshot: ProjectionFamilySnapshot<TKey, TValue>
  delta: IdDelta<TKey>
  order?: boolean
}): ProjectionFamilyChange<TKey, TValue> => {
  const hasChanges = idDelta.hasAny(input.delta)
  if (!hasChanges && !input.order) {
    return 'skip'
  }

  const setKeys = [
    ...input.delta.added,
    ...input.delta.updated
  ]
  const set = setKeys.map((key) => {
    const value = input.snapshot.byId.get(key)
    if (value === undefined) {
      throw new Error(`Projection family change set key ${String(key)} is missing from snapshot.`)
    }
    return [key, value] as const
  })

  return {
    ...(input.order
      ? {
          ids: input.snapshot.ids
        }
      : {}),
    ...(set.length
      ? {
          set
        }
      : {}),
    ...(input.delta.removed.size > 0
      ? {
          remove: [...input.delta.removed]
        }
      : {})
  }
}

export const compileFamilyChangeFromEntityDelta = <TKey extends string | number, TValue>(input: {
  snapshot: ProjectionFamilySnapshot<TKey, TValue>
  delta?: EntityDelta<TKey>
}): ProjectionFamilyChange<TKey, TValue> => {
  const delta = input.delta
  if (!delta) {
    return 'skip'
  }

  const set = delta.set?.map((key) => {
    const value = input.snapshot.byId.get(key)
    if (value === undefined) {
      throw new Error(`Projection family change set key ${String(key)} is missing from snapshot.`)
    }
    return [key, value] as const
  })

  return {
    ...(delta.order
      ? {
          ids: input.snapshot.ids
        }
      : {}),
    ...(set?.length
      ? {
          set
        }
      : {}),
    ...(delta.remove?.length
      ? {
          remove: delta.remove
        }
      : {})
  }
}
