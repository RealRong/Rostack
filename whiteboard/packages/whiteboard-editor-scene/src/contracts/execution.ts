import { idDelta, type IdDelta } from '@shared/delta'
import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import type { EdgeLabelKey, EdgeStaticId } from './render'
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

export interface WhiteboardGraphExecutionChange {
  entity: {
    node: ExecutionScope<NodeId>
    edge: ExecutionScope<EdgeId>
    mindmap: ExecutionScope<MindmapId>
    group: ExecutionScope<GroupId>
  }
  geometry: {
    node: ExecutionScope<NodeId>
    edge: ExecutionScope<EdgeId>
    mindmap: ExecutionScope<MindmapId>
    group: ExecutionScope<GroupId>
  }
  content: {
    node: ExecutionScope<NodeId>
    edge: ExecutionScope<EdgeId>
  }
  owner: {
    node: ExecutionScope<NodeId>
    mindmap: ExecutionScope<MindmapId>
    group: ExecutionScope<GroupId>
  }
}

export interface WhiteboardSceneExecution {
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
  change: {
    graph: WhiteboardGraphExecutionChange
    items: ExecutionScope<SceneItemKey>
    ui: {
      node: ExecutionScope<NodeId>
      edge: ExecutionScope<EdgeId>
      chrome: boolean
    }
    render: {
      node: ExecutionScope<NodeId>
      edge: {
        statics: ExecutionScope<EdgeStaticId>
        active: ExecutionScope<EdgeId>
        labels: ExecutionScope<EdgeLabelKey>
        masks: ExecutionScope<EdgeId>
      }
      chrome: {
        scene: boolean
        edge: boolean
      }
    }
  }
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

export const createEmptyWhiteboardGraphExecutionChange = (): WhiteboardGraphExecutionChange => ({
  entity: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    mindmap: createEmptyScope<MindmapId>(),
    group: createEmptyScope<GroupId>()
  },
  geometry: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>(),
    mindmap: createEmptyScope<MindmapId>(),
    group: createEmptyScope<GroupId>()
  },
  content: {
    node: createEmptyScope<NodeId>(),
    edge: createEmptyScope<EdgeId>()
  },
  owner: {
    node: createEmptyScope<NodeId>(),
    mindmap: createEmptyScope<MindmapId>(),
    group: createEmptyScope<GroupId>()
  }
})

export const createEmptyWhiteboardSceneExecution = (): WhiteboardSceneExecution => ({
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
  change: {
    graph: createEmptyWhiteboardGraphExecutionChange(),
    items: createEmptyScope<SceneItemKey>(),
    ui: {
      node: createEmptyScope<NodeId>(),
      edge: createEmptyScope<EdgeId>(),
      chrome: false
    },
    render: {
      node: createEmptyScope<NodeId>(),
      edge: {
        statics: createEmptyScope<EdgeStaticId>(),
        active: createEmptyScope<EdgeId>(),
        labels: createEmptyScope<EdgeLabelKey>(),
        masks: createEmptyScope<EdgeId>()
      },
      chrome: {
        scene: false,
        edge: false
      }
    }
  }
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
