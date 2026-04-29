import { idDelta, type IdDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { SceneItemKey } from './delta'

export type ExecutionScope<TId extends string> = ReadonlySet<TId> | 'all'

export interface WhiteboardRuntimeDelta {
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
  clock: {
    mindmaps: ReadonlySet<MindmapId>
  }
}

export interface WhiteboardGraphFacts {
  node: {
    entity: ExecutionScope<NodeId>
    geometry: ExecutionScope<NodeId>
    content: ExecutionScope<NodeId>
    owner: ExecutionScope<NodeId>
  }
  edge: {
    entity: ExecutionScope<EdgeId>
    geometry: ExecutionScope<EdgeId>
    content: ExecutionScope<EdgeId>
  }
  mindmap: {
    entity: ExecutionScope<MindmapId>
    geometry: ExecutionScope<MindmapId>
    owner: ExecutionScope<MindmapId>
  }
  group: {
    entity: ExecutionScope<GroupId>
    geometry: ExecutionScope<GroupId>
    owner: ExecutionScope<GroupId>
  }
}

export interface WhiteboardUiFacts {
  node: ExecutionScope<NodeId>
  edge: ExecutionScope<EdgeId>
  chrome: boolean
}

export interface WhiteboardExecution {
  reset: boolean
  order: boolean
  target: {
    node: ExecutionScope<NodeId>
    edge: ExecutionScope<EdgeId>
    mindmap: ExecutionScope<MindmapId>
    group: ExecutionScope<GroupId>
  }
  runtime: {
    node: ReadonlySet<NodeId>
    edge: ReadonlySet<EdgeId>
    mindmap: ReadonlySet<MindmapId>
    ui: boolean
  }
  graph: WhiteboardGraphFacts
  items: ExecutionScope<SceneItemKey>
  ui: WhiteboardUiFacts
}

const createEmptyScope = <TId extends string>(): ExecutionScope<TId> => new Set<TId>()

export const createEmptyWhiteboardRuntimeDelta = (): WhiteboardRuntimeDelta => ({
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
  },
  clock: {
    mindmaps: new Set()
  }
})

export const createEmptyWhiteboardGraphFacts = (): WhiteboardGraphFacts => ({
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
  }
})

export const createEmptyWhiteboardUiFacts = (): WhiteboardUiFacts => ({
  node: createEmptyScope<NodeId>(),
  edge: createEmptyScope<EdgeId>(),
  chrome: false
})

export const createEmptyWhiteboardExecution = (): WhiteboardExecution => ({
  reset: false,
  order: false,
  target: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    mindmap: createEmptyScope<MindmapId>(),
    group: createEmptyScope<GroupId>()
  },
  runtime: {
    node: new Set(),
    edge: new Set(),
    mindmap: new Set(),
    ui: false
  },
  graph: createEmptyWhiteboardGraphFacts(),
  items: createEmptyScope<SceneItemKey>(),
  ui: createEmptyWhiteboardUiFacts()
})

export const isExecutionScopeAll = <TId extends string>(
  scope: ExecutionScope<TId>
): scope is 'all' => scope === 'all'

export const executionScopeHasAny = <TId extends string>(
  scope: ExecutionScope<TId>
): boolean => scope === 'all' || scope.size > 0

export const executionScopeFromIdDelta = <TId extends string>(
  delta: IdDelta<TId>
): ExecutionScope<TId> => idDelta.hasAny(delta)
  ? idDelta.touched(delta)
  : new Set<TId>()

export const executionScopeFromValues = <TId extends string>(
  values: Iterable<TId>
): ExecutionScope<TId> => new Set(values)

export const executionScopeUnion = <TId extends string>(
  ...values: readonly ExecutionScope<TId>[]
): ExecutionScope<TId> => {
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

export const appendExecutionScope = <TId extends string>(
  target: Set<TId>,
  scope: ExecutionScope<TId>
): boolean => {
  if (scope === 'all') {
    return true
  }

  scope.forEach((id) => {
    target.add(id)
  })

  return false
}
