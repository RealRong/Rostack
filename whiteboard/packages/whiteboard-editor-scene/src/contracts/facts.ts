import { idDelta, type IdDelta } from '@shared/delta'
import type { SceneItemKey } from './delta'

export type SceneScope<TId extends string> = ReadonlySet<TId> | 'all'

export interface EditorSceneInputFacts {
  reset: boolean
  order: boolean
  graph: {
    node: SceneScope<string>
    edge: SceneScope<string>
    mindmap: SceneScope<string>
    group: SceneScope<string>
  }
}

export interface EditorSceneGraphFacts {
  node: {
    entity: SceneScope<string>
    geometry: SceneScope<string>
    content: SceneScope<string>
    owner: SceneScope<string>
  }
  edge: {
    entity: SceneScope<string>
    geometry: SceneScope<string>
    content: SceneScope<string>
  }
  mindmap: {
    entity: SceneScope<string>
    geometry: SceneScope<string>
    owner: SceneScope<string>
  }
  group: {
    entity: SceneScope<string>
    geometry: SceneScope<string>
    owner: SceneScope<string>
  }
  hasLifecycleChange: boolean
}

export interface EditorSceneItemsFacts {
  touched: SceneScope<SceneItemKey>
}

export interface EditorSceneUiFacts {
  node: SceneScope<string>
  edge: SceneScope<string>
  chrome: boolean
}

export interface EditorSceneRenderFacts {
  node: SceneScope<string>
  edgeStatics: SceneScope<string>
  edgeActive: SceneScope<string>
  edgeLabels: SceneScope<string>
  edgeMasks: SceneScope<string>
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

export const createEmptyEditorSceneFacts = (): EditorSceneFacts => ({
  input: {
    reset: false,
    order: false,
    graph: {
      node: createEmptyScope<string>(),
      edge: createEmptyScope<string>(),
      mindmap: createEmptyScope<string>(),
      group: createEmptyScope<string>()
    }
  },
  graph: {
    node: {
      entity: createEmptyScope<string>(),
      geometry: createEmptyScope<string>(),
      content: createEmptyScope<string>(),
      owner: createEmptyScope<string>()
    },
    edge: {
      entity: createEmptyScope<string>(),
      geometry: createEmptyScope<string>(),
      content: createEmptyScope<string>()
    },
    mindmap: {
      entity: createEmptyScope<string>(),
      geometry: createEmptyScope<string>(),
      owner: createEmptyScope<string>()
    },
    group: {
      entity: createEmptyScope<string>(),
      geometry: createEmptyScope<string>(),
      owner: createEmptyScope<string>()
    },
    hasLifecycleChange: false
  },
  items: {
    touched: createEmptyScope<SceneItemKey>()
  },
  ui: {
    node: createEmptyScope<string>(),
    edge: createEmptyScope<string>(),
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
