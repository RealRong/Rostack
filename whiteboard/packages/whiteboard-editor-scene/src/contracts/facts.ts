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

export interface EditorSceneInputFacts {
  reset: boolean
  order: boolean
  graph: {
    node: SceneScope<NodeId>
    edge: SceneScope<EdgeId>
    mindmap: SceneScope<MindmapId>
    group: SceneScope<GroupId>
  }
}

export interface EditorSceneGraphFacts {
  node: {
    entity: SceneScope<NodeId>
    geometry: SceneScope<NodeId>
    content: SceneScope<NodeId>
    owner: SceneScope<NodeId>
  }
  edge: {
    entity: SceneScope<EdgeId>
    geometry: SceneScope<EdgeId>
    content: SceneScope<EdgeId>
  }
  mindmap: {
    entity: SceneScope<MindmapId>
    geometry: SceneScope<MindmapId>
    owner: SceneScope<MindmapId>
  }
  group: {
    entity: SceneScope<GroupId>
    geometry: SceneScope<GroupId>
    owner: SceneScope<GroupId>
  }
  hasLifecycleChange: boolean
}

export interface EditorSceneItemsFacts {
  touched: SceneScope<SceneItemKey>
}

export interface EditorSceneUiFacts {
  node: SceneScope<NodeId>
  edge: SceneScope<EdgeId>
  chrome: boolean
}

export interface EditorSceneRenderFacts {
  node: SceneScope<NodeId>
  edgeStatics: SceneScope<EdgeId>
  edgeActive: SceneScope<EdgeId>
  edgeLabels: SceneScope<EdgeId>
  edgeMasks: SceneScope<EdgeId>
  chromeScene: boolean
  chromeEdge: boolean
}

export interface EditorSceneFacts {
  input: EditorSceneInputFacts
  graph: EditorSceneGraphFacts
  items: EditorSceneItemsFacts
  ui: EditorSceneUiFacts
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

export const createEmptyEditorSceneFacts = (): EditorSceneFacts => ({
  input: {
    reset: false,
    order: false,
    graph: {
      node: createEmptyScope<NodeId>(),
      edge: createEmptyScope<EdgeId>(),
      mindmap: createEmptyScope<MindmapId>(),
      group: createEmptyScope<GroupId>()
    }
  },
  graph: {
    node: {
      entity: createEmptyScope<NodeId>(),
      geometry: createEmptyScope<NodeId>(),
      content: createEmptyScope<NodeId>(),
      owner: createEmptyScope<NodeId>()
    },
    edge: {
      entity: createEmptyScope<EdgeId>(),
      geometry: createEmptyScope<EdgeId>(),
      content: createEmptyScope<EdgeId>()
    },
    mindmap: {
      entity: createEmptyScope<MindmapId>(),
      geometry: createEmptyScope<MindmapId>(),
      owner: createEmptyScope<MindmapId>()
    },
    group: {
      entity: createEmptyScope<GroupId>(),
      geometry: createEmptyScope<GroupId>(),
      owner: createEmptyScope<GroupId>()
    },
    hasLifecycleChange: false
  },
  items: {
    touched: createEmptyScope<SceneItemKey>()
  },
  ui: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    chrome: false
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
