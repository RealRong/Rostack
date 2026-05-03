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
    nodes: IdDelta<string>
    edges: IdDelta<string>
    mindmaps: IdDelta<string>
    groups: IdDelta<string>
  }
  geometry: {
    nodes: Set<string>
    edges: Set<string>
    mindmaps: Set<string>
    groups: Set<string>
  }
}

export type SceneItemKey =
  | `mindmap:${string}`
  | `node:${string}`
  | `edge:${string}`

export const sceneItemKey = key.tagged(['mindmap', 'node', 'edge'] as const)

export type SceneItemEntry = SceneItem & {
  key: SceneItemKey
}

export interface UiPhaseDelta {
  node: IdDelta<string>
  edge: IdDelta<string>
  chrome: boolean
}

const createUiPhaseDelta = (): UiPhaseDelta => ({
  node: idDelta.create<string>(),
  edge: idDelta.create<string>(),
  chrome: false
})

export interface RenderPhaseDelta {
  node: IdDelta<string>
  edge: {
    statics: IdDelta<EdgeStaticId>
    active: IdDelta<string>
    labels: IdDelta<EdgeLabelKey>
    masks: IdDelta<string>
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
  node: idDelta.create<string>(),
  edge: {
    statics: idDelta.create<EdgeStaticId>(),
    active: idDelta.create<string>(),
    labels: idDelta.create<EdgeLabelKey>(),
    masks: idDelta.create<string>(),
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
  node: ProjectionFamilyChange<string, NodeView>
  edge: ProjectionFamilyChange<string, EdgeView>
  mindmap: ProjectionFamilyChange<string, MindmapView>
  group: ProjectionFamilyChange<string, GroupView>
  state: {
    node: ProjectionFamilyChange<string, NodeStateView>
    edge: ProjectionFamilyChange<string, EdgeStateView>
    chrome: ProjectionValueChange<ChromeStateView>
  }
}

export interface RenderDelta {
  node: ProjectionFamilyChange<string, NodeRenderView>
  edge: {
    statics: ProjectionFamilyChange<EdgeStaticId, EdgeStaticView>
    active: ProjectionFamilyChange<string, EdgeActiveView>
    labels: ProjectionFamilyChange<EdgeLabelKey, EdgeLabelView>
    masks: ProjectionFamilyChange<string, EdgeMaskView>
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
    nodes: idDelta.create<string>(),
    edges: idDelta.create<string>(),
    mindmaps: idDelta.create<string>(),
    groups: idDelta.create<string>()
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
