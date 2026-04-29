import type {
  EdgeId,
  GroupId,
  MindmapId,
  NodeId
} from '@whiteboard/core/types'
import {
  createTypedMutationDelta,
  defineMutationSchema,
  type MutationDelta,
  type MutationDeltaInput
} from '@shared/mutation'

export type WhiteboardGraphTargets = {
  reset: boolean
  order: boolean
  nodes: ReadonlySet<NodeId> | 'all'
  edges: ReadonlySet<EdgeId> | 'all'
  mindmaps: ReadonlySet<MindmapId> | 'all'
  groups: ReadonlySet<GroupId> | 'all'
}

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
  graph: {
    orderChanged(): boolean
    targets(): WhiteboardGraphTargets
    affects: {
      items(): boolean
      edgeRouteIds(): ReadonlySet<EdgeId> | 'all'
      edgeStyleIds(): ReadonlySet<EdgeId> | 'all'
      edgeLabelIds(): ReadonlySet<EdgeId> | 'all'
      edgeEndpointIds(): ReadonlySet<EdgeId> | 'all'
      edgeBoxIds(): ReadonlySet<EdgeId> | 'all'
      mindmapGeometryIds(): ReadonlySet<MindmapId> | 'all'
      mindmapConnectorIds(): ReadonlySet<MindmapId> | 'all'
      mindmapMembershipIds(): ReadonlySet<MindmapId> | 'all'
      groupGeometryIds(): ReadonlySet<GroupId> | 'all'
      groupMembershipIds(): ReadonlySet<GroupId> | 'all'
    }
  }
}

const whiteboardMutationSchema = defineMutationSchema({
  'canvas.order': {},
  'node.create': {
    ids: true
  },
  'node.delete': {
    ids: true
  },
  'node.geometry': {
    ids: true
  },
  'node.owner': {
    ids: true
  },
  'node.content': {
    ids: true
  },
  'edge.create': {
    ids: true
  },
  'edge.delete': {
    ids: true
  },
  'edge.endpoints': {
    ids: true
  },
  'edge.route': {
    ids: true
  },
  'edge.style': {
    ids: true
  },
  'edge.labels': {
    ids: true
  },
  'edge.data': {
    ids: true
  },
  'mindmap.create': {
    ids: true
  },
  'mindmap.delete': {
    ids: true
  },
  'mindmap.structure': {
    ids: true
  },
  'mindmap.layout': {
    ids: true
  },
  'group.create': {
    ids: true
  },
  'group.delete': {
    ids: true
  },
  'group.value': {
    ids: true
  }
} as const)

const createTouchedIdView = <TId extends string>(
  read: () => ReadonlySet<TId> | 'all',
  changed: (id?: TId) => boolean
) => ({
  touchedIds: read,
  changed
})

const unionTouchedIds = <TId extends string>(
  ...values: readonly (ReadonlySet<TId> | 'all')[]
): ReadonlySet<TId> | 'all' => {
  const result = new Set<TId>()
  for (let index = 0; index < values.length; index += 1) {
    const current = values[index]
    if (current === 'all') {
      return 'all'
    }
    current.forEach((id) => {
      result.add(id)
    })
  }
  return result
}

const hasOwn = (
  value: object,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

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
      const graphOrderChanged = () => {
        if (context.raw.reset === true || hasOwn(context.raw.changes, 'canvas.order')) {
          return true
        }

        for (const change of Object.values(context.raw.changes)) {
          if (change.order === true) {
            return true
          }
        }

        return false
      }

      const createGraphTargets = (): WhiteboardGraphTargets => {
        if (context.raw.reset === true) {
          return {
            reset: true,
            order: true,
            nodes: 'all',
            edges: 'all',
            mindmaps: 'all',
            groups: 'all'
          }
        }

        const nodes = context.touchedIds([
          'node.create',
          'node.delete',
          'node.geometry',
          'node.owner',
          'node.content'
        ]) as ReadonlySet<NodeId> | 'all'
        const edges = context.touchedIds([
          'edge.create',
          'edge.delete',
          'edge.endpoints',
          'edge.route',
          'edge.style',
          'edge.labels',
          'edge.data'
        ]) as ReadonlySet<EdgeId> | 'all'
        const mindmaps = context.touchedIds([
          'mindmap.create',
          'mindmap.delete',
          'mindmap.structure',
          'mindmap.layout'
        ]) as ReadonlySet<MindmapId> | 'all'
        const groups = context.touchedIds([
          'group.create',
          'group.delete',
          'group.value'
        ]) as ReadonlySet<GroupId> | 'all'

        const reset = nodes === 'all'
          || edges === 'all'
          || mindmaps === 'all'
          || groups === 'all'

        return {
          reset,
          order: graphOrderChanged(),
          nodes,
          edges,
          mindmaps,
          groups
        }
      }

      const readEdgeRouteIds = () => unionTouchedIds(
        context.touchedIds(['edge.endpoints']) as ReadonlySet<EdgeId> | 'all',
        context.touchedIds(['edge.route']) as ReadonlySet<EdgeId> | 'all'
      )
      const readEdgeStyleIds = () => unionTouchedIds(
        context.touchedIds(['edge.style']) as ReadonlySet<EdgeId> | 'all',
        context.touchedIds(['edge.data']) as ReadonlySet<EdgeId> | 'all'
      )
      const readEdgeLabelIds = () => unionTouchedIds(
        readEdgeRouteIds(),
        context.touchedIds(['edge.labels']) as ReadonlySet<EdgeId> | 'all',
        context.touchedIds(['edge.data']) as ReadonlySet<EdgeId> | 'all'
      )
      const readMindmapGeometryIds = () => unionTouchedIds(
        context.touchedIds(['mindmap.structure']) as ReadonlySet<MindmapId> | 'all',
        context.touchedIds(['mindmap.layout']) as ReadonlySet<MindmapId> | 'all'
      )
      const readGroupGeometryIds = () => (
        context.touchedIds(['group.value']) as ReadonlySet<GroupId> | 'all'
      )

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
        },
        graph: {
          orderChanged: graphOrderChanged,
          targets: createGraphTargets,
          affects: {
            edgeRouteIds: readEdgeRouteIds,
            edgeStyleIds: readEdgeStyleIds,
            edgeLabelIds: readEdgeLabelIds,
            edgeEndpointIds: readEdgeRouteIds,
            edgeBoxIds: readEdgeRouteIds,
            mindmapGeometryIds: readMindmapGeometryIds,
            mindmapConnectorIds: readMindmapGeometryIds,
            mindmapMembershipIds: readMindmapGeometryIds,
            groupGeometryIds: readGroupGeometryIds,
            groupMembershipIds: readGroupGeometryIds,
            items: () => context.any([
              'canvas.order',
              'node.create',
              'node.delete',
              'edge.create',
              'edge.delete',
              'mindmap.create',
              'mindmap.delete'
            ])
          }
        }
      }
    }
  }) as WhiteboardMutationDelta

  if (raw && typeof raw === 'object') {
    WHITEBOARD_DELTA_CACHE.set(raw as MutationDelta, delta)
  }
  return delta
}
