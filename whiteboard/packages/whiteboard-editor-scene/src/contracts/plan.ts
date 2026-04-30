import { idDelta, type IdDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { SceneItemKey } from './delta'

export type SceneScope<TId extends string> = ReadonlySet<TId> | 'all'

export interface EditorSceneRuntimeDelta {
  session: {
    tool: boolean
    selection: boolean
    hover: boolean
    edit: boolean
    interaction: boolean
    draft: {
      edges: IdDelta<EdgeId>
    }
    preview: {
      nodes: IdDelta<NodeId>
      edges: IdDelta<EdgeId>
      mindmaps: IdDelta<MindmapId>
      marquee: boolean
      guides: boolean
      draw: boolean
      edgeGuide: boolean
    }
  }
}

export interface EditorScenePlan {
  reset: boolean
  order: boolean
  graph: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    mindmap: SceneScope<MindmapId>
    group: SceneScope<GroupId>
  }
  spatial: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    mindmap: SceneScope<MindmapId>
    group: SceneScope<GroupId>
    order: boolean
  }
  items: SceneScope<SceneItemKey>
  ui: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    chrome: boolean
  }
  render: {
    node: SceneScope<NodeId>
    edgeStatics: SceneScope<EdgeId>
    edgeActive: SceneScope<EdgeId>
    edgeLabels: SceneScope<EdgeId>
    edgeMasks: SceneScope<EdgeId>
    chromeScene: boolean
    chromeEdge: boolean
  }
}

const createEmptyScope = <TId extends string>(): SceneScope<TId> => new Set<TId>()

export const createEmptyEditorSceneRuntimeDelta = (): EditorSceneRuntimeDelta => ({
  session: {
    tool: false,
    selection: false,
    hover: false,
    edit: false,
    interaction: false,
    draft: {
      edges: idDelta.create<EdgeId>()
    },
    preview: {
      nodes: idDelta.create<NodeId>(),
      edges: idDelta.create<EdgeId>(),
      mindmaps: idDelta.create<MindmapId>(),
      marquee: false,
      guides: false,
      draw: false,
      edgeGuide: false
    }
  }
})

export const createEmptyEditorScenePlan = (): EditorScenePlan => ({
  reset: false,
  order: false,
  graph: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    mindmap: createEmptyScope<MindmapId>(),
    group: createEmptyScope<GroupId>()
  },
  spatial: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    mindmap: createEmptyScope<MindmapId>(),
    group: createEmptyScope<GroupId>(),
    order: false
  },
  items: createEmptyScope<SceneItemKey>(),
  ui: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    chrome: false
  },
  render: {
    node: createEmptyScope<NodeId>(),
    edgeStatics: createEmptyScope<EdgeId>(),
    edgeActive: createEmptyScope<EdgeId>(),
    edgeLabels: createEmptyScope<EdgeId>(),
    edgeMasks: createEmptyScope<EdgeId>(),
    chromeScene: false,
    chromeEdge: false
  }
})

export const isSceneScopeAll = <TId extends string>(
  scope: SceneScope<TId>
): scope is 'all' => scope === 'all'

export const sceneScopeHasAny = <TId extends string>(
  scope: SceneScope<TId>
): boolean => scope === 'all' || scope.size > 0

export const sceneScopeFromIdDelta = <TId extends string>(
  delta: IdDelta<TId>
): SceneScope<TId> => idDelta.hasAny(delta)
  ? idDelta.touched(delta)
  : new Set<TId>()

export const sceneScopeFromValues = <TId extends string>(
  values: Iterable<TId>
): SceneScope<TId> => new Set(values)

export const sceneScopeUnion = <TId extends string>(
  ...values: readonly SceneScope<TId>[]
): SceneScope<TId> => {
  const result = new Set<TId>()

  for (const value of values) {
    if (value === 'all') {
      return 'all'
    }
    value.forEach((id) => {
      result.add(id)
    })
  }

  return result
}

export const appendSceneScope = <TId extends string>(
  target: Set<TId>,
  scope: SceneScope<TId>
): boolean => {
  if (scope === 'all') {
    return true
  }

  scope.forEach((id) => {
    target.add(id)
  })

  return false
}
