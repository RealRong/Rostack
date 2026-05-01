import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import {
  normalizeMutationDelta,
  type MutationDelta,
  type MutationDeltaInput
} from '@shared/mutation'

export type WhiteboardMutationDelta = MutationDelta & {
  raw: MutationDelta
  canvas: {
    orderChanged(): boolean
  }
  node: {
    create: {
      touchedIds(): ReadonlySet<NodeId> | 'all'
      changed(nodeId?: NodeId): boolean
    }
    delete: {
      touchedIds(): ReadonlySet<NodeId> | 'all'
      changed(nodeId?: NodeId): boolean
    }
    geometry: {
      touchedIds(): ReadonlySet<NodeId> | 'all'
      changed(nodeId?: NodeId): boolean
    }
    owner: {
      touchedIds(): ReadonlySet<NodeId> | 'all'
      changed(nodeId?: NodeId): boolean
    }
    content: {
      touchedIds(): ReadonlySet<NodeId> | 'all'
      changed(nodeId?: NodeId): boolean
    }
  }
  edge: {
    create: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
    delete: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
    endpoints: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
    route: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
    style: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
    labels: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
    data: {
      touchedIds(): ReadonlySet<EdgeId> | 'all'
      changed(edgeId?: EdgeId): boolean
    }
  }
  mindmap: {
    create: {
      touchedIds(): ReadonlySet<MindmapId> | 'all'
      changed(mindmapId?: MindmapId): boolean
    }
    delete: {
      touchedIds(): ReadonlySet<MindmapId> | 'all'
      changed(mindmapId?: MindmapId): boolean
    }
    structure: {
      touchedIds(): ReadonlySet<MindmapId> | 'all'
      changed(mindmapId?: MindmapId): boolean
    }
    layout: {
      touchedIds(): ReadonlySet<MindmapId> | 'all'
      changed(mindmapId?: MindmapId): boolean
    }
  }
  group: {
    create: {
      touchedIds(): ReadonlySet<GroupId> | 'all'
      changed(groupId?: GroupId): boolean
    }
    delete: {
      touchedIds(): ReadonlySet<GroupId> | 'all'
      changed(groupId?: GroupId): boolean
    }
    value: {
      touchedIds(): ReadonlySet<GroupId> | 'all'
      changed(groupId?: GroupId): boolean
    }
  }
}

const createTouchedIdView = <TId extends string>(
  read: () => ReadonlySet<TId> | 'all',
  changed: (id?: TId) => boolean
) => ({
  touchedIds: read,
  changed
})

const changedKey = (
  delta: MutationDelta,
  key: string,
  id?: string
): boolean => delta.reset === true || delta.changed(key, id)

const hasKey = (
  delta: MutationDelta,
  key: string
): boolean => delta.reset === true || delta.has(key)

const readTouchedIds = <TId extends string>(
  delta: MutationDelta,
  keys: readonly string[]
): ReadonlySet<TId> | 'all' => {
  if (delta.reset === true) {
    return 'all'
  }

  let result: Set<TId> | undefined
  for (let index = 0; index < keys.length; index += 1) {
    const ids = delta.ids(keys[index]!)
    if (ids === 'all') {
      return 'all'
    }
    if (ids.size === 0) {
      continue
    }
    if (!result) {
      result = new Set<TId>()
    }
    ids.forEach((id) => {
      result!.add(id as TId)
    })
  }

  return result ?? new Set<TId>()
}

const WHITEBOARD_DELTA_CACHE = new WeakMap<MutationDelta, WhiteboardMutationDelta>()

export const createWhiteboardMutationDelta = (
  raw: MutationDelta | MutationDeltaInput
): WhiteboardMutationDelta => {
  const normalized = normalizeMutationDelta(raw)
  const cached = WHITEBOARD_DELTA_CACHE.get(normalized)
  if (cached) {
    return cached
  }

  const delta = Object.assign({}, normalized, {
    raw: normalized,
    canvas: {
      orderChanged: () => hasKey(normalized, 'canvas.order')
    },
    node: {
      create: createTouchedIdView<NodeId>(
        () => readTouchedIds<NodeId>(normalized, ['node.create']),
        (nodeId) => changedKey(normalized, 'node.create', nodeId)
      ),
      delete: createTouchedIdView<NodeId>(
        () => readTouchedIds<NodeId>(normalized, ['node.delete']),
        (nodeId) => changedKey(normalized, 'node.delete', nodeId)
      ),
      geometry: createTouchedIdView<NodeId>(
        () => readTouchedIds<NodeId>(normalized, ['node.geometry']),
        (nodeId) => changedKey(normalized, 'node.geometry', nodeId)
      ),
      owner: createTouchedIdView<NodeId>(
        () => readTouchedIds<NodeId>(normalized, ['node.owner']),
        (nodeId) => changedKey(normalized, 'node.owner', nodeId)
      ),
      content: createTouchedIdView<NodeId>(
        () => readTouchedIds<NodeId>(normalized, ['node.content']),
        (nodeId) => changedKey(normalized, 'node.content', nodeId)
      )
    },
    edge: {
      create: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.create']),
        (edgeId) => changedKey(normalized, 'edge.create', edgeId)
      ),
      delete: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.delete']),
        (edgeId) => changedKey(normalized, 'edge.delete', edgeId)
      ),
      endpoints: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.endpoints']),
        (edgeId) => changedKey(normalized, 'edge.endpoints', edgeId)
      ),
      route: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.route']),
        (edgeId) => changedKey(normalized, 'edge.route', edgeId)
      ),
      style: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.style']),
        (edgeId) => changedKey(normalized, 'edge.style', edgeId)
      ),
      labels: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.labels']),
        (edgeId) => changedKey(normalized, 'edge.labels', edgeId)
      ),
      data: createTouchedIdView<EdgeId>(
        () => readTouchedIds<EdgeId>(normalized, ['edge.data']),
        (edgeId) => changedKey(normalized, 'edge.data', edgeId)
      )
    },
    mindmap: {
      create: createTouchedIdView<MindmapId>(
        () => readTouchedIds<MindmapId>(normalized, ['mindmap.create']),
        (mindmapId) => changedKey(normalized, 'mindmap.create', mindmapId)
      ),
      delete: createTouchedIdView<MindmapId>(
        () => readTouchedIds<MindmapId>(normalized, ['mindmap.delete']),
        (mindmapId) => changedKey(normalized, 'mindmap.delete', mindmapId)
      ),
      structure: createTouchedIdView<MindmapId>(
        () => readTouchedIds<MindmapId>(normalized, ['mindmap.structure']),
        (mindmapId) => changedKey(normalized, 'mindmap.structure', mindmapId)
      ),
      layout: createTouchedIdView<MindmapId>(
        () => readTouchedIds<MindmapId>(normalized, ['mindmap.layout']),
        (mindmapId) => changedKey(normalized, 'mindmap.layout', mindmapId)
      )
    },
    group: {
      create: createTouchedIdView<GroupId>(
        () => readTouchedIds<GroupId>(normalized, ['group.create']),
        (groupId) => changedKey(normalized, 'group.create', groupId)
      ),
      delete: createTouchedIdView<GroupId>(
        () => readTouchedIds<GroupId>(normalized, ['group.delete']),
        (groupId) => changedKey(normalized, 'group.delete', groupId)
      ),
      value: createTouchedIdView<GroupId>(
        () => readTouchedIds<GroupId>(normalized, ['group.value']),
        (groupId) => changedKey(normalized, 'group.value', groupId)
      )
    }
  }) as WhiteboardMutationDelta

  WHITEBOARD_DELTA_CACHE.set(normalized, delta)
  return delta
}
