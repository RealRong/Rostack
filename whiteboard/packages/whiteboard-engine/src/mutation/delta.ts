import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import {
  createTypedMutationDelta,
  type MutationDelta,
  type MutationDeltaInput
} from '@shared/mutation'
import {
  whiteboardMutationSchema
} from '@whiteboard/core/mutation'

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

const WHITEBOARD_DELTA_CACHE = new WeakMap<MutationDelta, WhiteboardMutationDelta>()

export const createWhiteboardMutationDelta = (
  raw: MutationDelta | MutationDeltaInput
): WhiteboardMutationDelta => {
  const cached = raw && typeof raw === 'object'
    ? WHITEBOARD_DELTA_CACHE.get(raw as MutationDelta)
    : undefined
  if (cached) {
    return cached
  }

  const delta = createTypedMutationDelta({
    raw,
    schema: whiteboardMutationSchema,
    build: (context) => {
      return {
        canvas: {
          orderChanged: () => context.has('canvas.order')
        },
        node: {
          create: createTouchedIdView<NodeId>(
            () => context.touchedIds(['node.create']) as ReadonlySet<NodeId> | 'all',
            (nodeId) => context.changed('node.create', nodeId)
          ),
          delete: createTouchedIdView<NodeId>(
            () => context.touchedIds(['node.delete']) as ReadonlySet<NodeId> | 'all',
            (nodeId) => context.changed('node.delete', nodeId)
          ),
          geometry: createTouchedIdView<NodeId>(
            () => context.touchedIds(['node.geometry']) as ReadonlySet<NodeId> | 'all',
            (nodeId) => context.changed('node.geometry', nodeId)
          ),
          owner: createTouchedIdView<NodeId>(
            () => context.touchedIds(['node.owner']) as ReadonlySet<NodeId> | 'all',
            (nodeId) => context.changed('node.owner', nodeId)
          ),
          content: createTouchedIdView<NodeId>(
            () => context.touchedIds(['node.content']) as ReadonlySet<NodeId> | 'all',
            (nodeId) => context.changed('node.content', nodeId)
          )
        },
        edge: {
          create: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.create']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.create', edgeId)
          ),
          delete: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.delete']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.delete', edgeId)
          ),
          endpoints: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.endpoints']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.endpoints', edgeId)
          ),
          route: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.route']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.route', edgeId)
          ),
          style: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.style']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.style', edgeId)
          ),
          labels: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.labels']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.labels', edgeId)
          ),
          data: createTouchedIdView<EdgeId>(
            () => context.touchedIds(['edge.data']) as ReadonlySet<EdgeId> | 'all',
            (edgeId) => context.changed('edge.data', edgeId)
          )
        },
        mindmap: {
          create: createTouchedIdView<MindmapId>(
            () => context.touchedIds(['mindmap.create']) as ReadonlySet<MindmapId> | 'all',
            (mindmapId) => context.changed('mindmap.create', mindmapId)
          ),
          delete: createTouchedIdView<MindmapId>(
            () => context.touchedIds(['mindmap.delete']) as ReadonlySet<MindmapId> | 'all',
            (mindmapId) => context.changed('mindmap.delete', mindmapId)
          ),
          structure: createTouchedIdView<MindmapId>(
            () => context.touchedIds(['mindmap.structure']) as ReadonlySet<MindmapId> | 'all',
            (mindmapId) => context.changed('mindmap.structure', mindmapId)
          ),
          layout: createTouchedIdView<MindmapId>(
            () => context.touchedIds(['mindmap.layout']) as ReadonlySet<MindmapId> | 'all',
            (mindmapId) => context.changed('mindmap.layout', mindmapId)
          )
        },
        group: {
          create: createTouchedIdView<GroupId>(
            () => context.touchedIds(['group.create']) as ReadonlySet<GroupId> | 'all',
            (groupId) => context.changed('group.create', groupId)
          ),
          delete: createTouchedIdView<GroupId>(
            () => context.touchedIds(['group.delete']) as ReadonlySet<GroupId> | 'all',
            (groupId) => context.changed('group.delete', groupId)
          ),
          value: createTouchedIdView<GroupId>(
            () => context.touchedIds(['group.value']) as ReadonlySet<GroupId> | 'all',
            (groupId) => context.changed('group.value', groupId)
          )
        }
      }
    }
  }) as WhiteboardMutationDelta

  if (raw && typeof raw === 'object') {
    WHITEBOARD_DELTA_CACHE.set(raw as MutationDelta, delta)
  }
  return delta
}
