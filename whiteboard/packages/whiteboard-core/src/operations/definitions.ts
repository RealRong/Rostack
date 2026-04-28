import type { ReducerResult } from '@shared/reducer'
import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import {
  readWhiteboardReduceInternal
} from '@whiteboard/core/reducer/context'
import {
  collectConnectedEdges,
  getEdge,
  getGroup,
  getMindmap,
  getMindmapTree,
  getNode
} from '@whiteboard/core/reducer/internal/state'
import type {
  OrderedAnchor,
  WhiteboardReduceCtx,
  WhiteboardReduceExtra,
  WhiteboardReduceIssueCode
} from '@whiteboard/core/reducer/types'
import type {
  HistoryFootprint,
  HistoryKey
} from '@whiteboard/core/operations/history'
import type {
  Document,
  Edge,
  EdgeId,
  EdgeLabelAnchor,
  EdgeRoutePointAnchor,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  NodeOwner,
  Operation
} from '@whiteboard/core/types'
type WhiteboardHistoryRead = {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  group(id: GroupId): Group | undefined
  mindmap(id: MindmapId): MindmapRecord | undefined
  mindmapTree(id: MindmapId | NodeId): ReturnType<typeof mindmapApi.tree.fromRecord> | undefined
  connectedEdges(nodeIds: ReadonlySet<NodeId>): readonly Edge[]
}

type WhiteboardFootprintContext = {
  read: WhiteboardHistoryRead
  add(key: HistoryKey): void
  addMany(keys: readonly HistoryKey[]): void
}

type WhiteboardOperation = Operation

type WhiteboardOperationDefinition<
  TType extends WhiteboardOperation['type'] = WhiteboardOperation['type']
> = {
  family:
    | 'document'
    | 'node'
    | 'edge'
    | 'group'
    | 'mindmap'
  sync?: 'live' | 'checkpoint'
  history?: boolean
  footprint?(
    ctx: WhiteboardReduceCtx,
    op: Extract<WhiteboardOperation, { type: TType }>
  ): void
  apply(
    ctx: WhiteboardReduceCtx,
    op: Extract<WhiteboardOperation, { type: TType }>
  ): void
}

type WhiteboardOperationDefinitionTable = {
  [TType in WhiteboardOperation['type']]: WhiteboardOperationDefinition<TType>
}


const toOrderedAnchor = (
  anchor: EdgeLabelAnchor | EdgeRoutePointAnchor
): OrderedAnchor => (
  anchor.kind === 'start' || anchor.kind === 'end'
    ? anchor
    : anchor.kind === 'before'
      ? {
          kind: 'before',
          itemId: 'labelId' in anchor
            ? anchor.labelId
            : anchor.pointId
        }
      : {
          kind: 'after',
          itemId: 'labelId' in anchor
            ? anchor.labelId
            : anchor.pointId
        }
)

const createHistoryRead = (
  ctx: WhiteboardReduceCtx
): WhiteboardHistoryRead => {
  const state = readWhiteboardReduceInternal(ctx).state

  return {
    node: (id) => getNode(state.draft, id),
    edge: (id) => getEdge(state.draft, id),
    group: (id) => getGroup(state.draft, id),
    mindmap: (id) => getMindmap(state.draft, id),
    mindmapTree: (id) => getMindmapTree(state.draft, id),
    connectedEdges: (nodeIds) => collectConnectedEdges(state.draft, nodeIds)
  }
}

const createFootprintContext = (
  ctx: WhiteboardReduceCtx
): WhiteboardFootprintContext => {
  const read = createHistoryRead(ctx)

  return {
    read,
    add: ctx.history.add,
    addMany: ctx.history.addMany
  }
}

const addOwnerMindmap = (
  ctx: WhiteboardFootprintContext,
  owner: NodeOwner | undefined
) => {
  if (owner?.kind === 'mindmap') {
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: owner.id
    })
  }
}

const addNodeExists = (
  ctx: WhiteboardFootprintContext,
  nodeId: string
) => {
  ctx.add({
    kind: 'node.exists',
    nodeId
  })
}

const addEdgeExists = (
  ctx: WhiteboardFootprintContext,
  edgeId: string
) => {
  ctx.add({
    kind: 'edge.exists',
    edgeId
  })
}

const collectNodeSubtreeEdgeKeys = (
  ctx: WhiteboardFootprintContext,
  nodeIds: ReadonlySet<NodeId>
) => {
  const connectedEdges = ctx.read.connectedEdges(nodeIds)
  connectedEdges.forEach((edge) => addEdgeExists(ctx, edge.id))
}

const readMindmapSubtreeNodeIds = (
  ctx: WhiteboardFootprintContext,
  mindmapId: MindmapId,
  rootId: NodeId
): readonly NodeId[] => {
  const tree = ctx.read.mindmapTree(mindmapId)
  return tree
    ? mindmapApi.tree.subtreeIds(tree, rootId)
    : []
}

const readNodeOwners = (
  node: Pick<Node, 'owner'> | undefined,
  nextOwner?: NodeOwner
): readonly NodeOwner[] => {
  const owners: NodeOwner[] = []
  if (node?.owner) {
    owners.push(node.owner)
  }
  if (
    nextOwner
    && !owners.some((owner) => owner.kind === nextOwner.kind && owner.id === nextOwner.id)
  ) {
    owners.push(nextOwner)
  }
  return owners
}

const defineFootprint = <TType extends WhiteboardOperation['type']>(
  collect: (
    ctx: WhiteboardFootprintContext,
    op: Extract<WhiteboardOperation, { type: TType }>
  ) => void
) => (
  ctx: WhiteboardReduceCtx,
  op: Extract<WhiteboardOperation, { type: TType }>
) => {
  collect(createFootprintContext(ctx), op)
}

const hasOwn = <T extends object>(
  value: T,
  key: PropertyKey
): boolean => Object.prototype.hasOwnProperty.call(value, key)

const toScopedRecordKeys = (record?: Readonly<Record<string, unknown>>) => Object.keys(
  record ?? {}
).flatMap((path) => {
  if (path === 'data' || path.startsWith('data.')) {
    return [{
      scope: 'data' as const,
      path: path === 'data'
        ? ''
        : path.slice('data.'.length)
    }]
  }
  if (path === 'style' || path.startsWith('style.')) {
    return [{
      scope: 'style' as const,
      path: path === 'style'
        ? ''
        : path.slice('style.'.length)
    }]
  }
  return []
})

export type WhiteboardOperationReduceExtra = WhiteboardReduceExtra

export type WhiteboardOperationReduceResult = ReducerResult<
  Document,
  Operation,
  HistoryFootprint[number],
  WhiteboardOperationReduceExtra,
  WhiteboardReduceIssueCode
>

export const definitions: WhiteboardOperationDefinitionTable = {
  'document.replace': {
    family: 'document',
    sync: 'checkpoint',
    footprint: defineFootprint(() => {}),
    apply: (ctx, operation) => {
      ctx.document.replace(operation.document)
    }
  },
  'document.background': {
    family: 'document',
    footprint: defineFootprint((ctx) => {
      ctx.add({
        kind: 'document.background'
      })
    }),
    apply: (ctx, operation) => {
      ctx.document.setBackground(operation.background)
    }
  },
  'canvas.order.move': {
    family: 'document',
    footprint: defineFootprint((ctx) => {
      ctx.add({
        kind: 'canvas.order'
      })
    }),
    apply: (ctx, operation) => {
      ctx.canvas.move(operation.refs, operation.to)
    }
  },
  'node.create': {
    family: 'node',
    footprint: defineFootprint((ctx, op) => {
      addNodeExists(ctx, op.node.id)
      addOwnerMindmap(ctx, op.node.owner)
    }),
    apply: (ctx, operation) => {
      ctx.node.create(operation.node)
    }
  },
  'node.restore': {
    family: 'node',
    footprint: defineFootprint((ctx, op) => {
      addNodeExists(ctx, op.node.id)
      addOwnerMindmap(ctx, op.node.owner)
    }),
    apply: (ctx, operation) => {
      ctx.node.restore(operation.node, operation.slot)
    }
  },
  'node.patch': {
    family: 'node',
    footprint: defineFootprint((ctx, op) => {
      const node = ctx.read.node(op.id)
      Object.keys(op.fields ?? {}).forEach((field) => {
        ctx.add({
          kind: 'node.field',
          nodeId: op.id,
          field: field as Extract<HistoryKey, { kind: 'node.field' }>['field']
        })
      })
      toScopedRecordKeys(op.record).forEach((entry) => {
        ctx.add({
          kind: 'node.record',
          nodeId: op.id,
          scope: entry.scope,
          path: entry.path
        })
      })
      readNodeOwners(
        node,
        op.fields && hasOwn(op.fields, 'owner')
          ? op.fields.owner
          : undefined
      ).forEach((owner) => addOwnerMindmap(ctx, owner))
    }),
    apply: (ctx, operation) => {
      ctx.node.patch(operation.id, {
        fields: operation.fields,
        record: operation.record
      })
    }
  },
  'node.delete': {
    family: 'node',
    footprint: defineFootprint((ctx, op) => {
      const node = ctx.read.node(op.id)
      addNodeExists(ctx, op.id)
      addOwnerMindmap(ctx, node?.owner)
    }),
    apply: (ctx, operation) => {
      ctx.node.delete(operation.id)
    }
  },
  'edge.create': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addEdgeExists(ctx, op.edge.id)
    }),
    apply: (ctx, operation) => {
      ctx.edge.create(operation.edge)
    }
  },
  'edge.restore': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addEdgeExists(ctx, op.edge.id)
    }),
    apply: (ctx, operation) => {
      ctx.edge.restore(operation.edge, operation.slot)
    }
  },
  'edge.patch': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        ctx.add({
          kind: 'edge.field',
          edgeId: op.id,
          field: field as Extract<HistoryKey, { kind: 'edge.field' }>['field']
        })
      })
      toScopedRecordKeys(op.record).forEach((entry) => {
        ctx.add({
          kind: 'edge.record',
          edgeId: op.id,
          scope: entry.scope,
          path: entry.path
        })
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.patch(operation.id, {
        fields: operation.fields,
        record: operation.record
      })
    }
  },
  'edge.label.insert': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.labels',
        edgeId: op.edgeId
      })
      ctx.add({
        kind: 'edge.label.exists',
        edgeId: op.edgeId,
        labelId: op.label.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.insertLabel(operation.edgeId, operation.label, toOrderedAnchor(operation.to))
    }
  },
  'edge.label.delete': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.labels',
        edgeId: op.edgeId
      })
      ctx.add({
        kind: 'edge.label.exists',
        edgeId: op.edgeId,
        labelId: op.labelId
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.deleteLabel(operation.edgeId, operation.labelId)
    }
  },
  'edge.label.move': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.labels',
        edgeId: op.edgeId
      })
      ctx.add({
        kind: 'edge.label.exists',
        edgeId: op.edgeId,
        labelId: op.labelId
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.moveLabel(operation.edgeId, operation.labelId, toOrderedAnchor(operation.to))
    }
  },
  'edge.label.patch': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        ctx.add({
          kind: 'edge.label.field',
          edgeId: op.edgeId,
          labelId: op.labelId,
          field: field as Extract<HistoryKey, { kind: 'edge.label.field' }>['field']
        })
      })
      toScopedRecordKeys(op.record).forEach((entry) => {
        ctx.add({
          kind: 'edge.label.record',
          edgeId: op.edgeId,
          labelId: op.labelId,
          scope: entry.scope,
          path: entry.path
        })
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.patchLabel(operation.edgeId, operation.labelId, {
        fields: operation.fields,
        record: operation.record
      })
    }
  },
  'edge.route.point.insert': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.route',
        edgeId: op.edgeId
      })
      ctx.add({
        kind: 'edge.route.point',
        edgeId: op.edgeId,
        pointId: op.point.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.insertRoutePoint(operation.edgeId, operation.point, toOrderedAnchor(operation.to))
    }
  },
  'edge.route.point.delete': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.route',
        edgeId: op.edgeId
      })
      ctx.add({
        kind: 'edge.route.point',
        edgeId: op.edgeId,
        pointId: op.pointId
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.deleteRoutePoint(operation.edgeId, operation.pointId)
    }
  },
  'edge.route.point.move': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.route',
        edgeId: op.edgeId
      })
      ctx.add({
        kind: 'edge.route.point',
        edgeId: op.edgeId,
        pointId: op.pointId
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.moveRoutePoint(operation.edgeId, operation.pointId, toOrderedAnchor(operation.to))
    }
  },
  'edge.route.point.patch': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'edge.route.point',
        edgeId: op.edgeId,
        pointId: op.pointId
      })
    }),
    apply: (ctx, operation) => {
      ctx.edge.patchRoutePoint(operation.edgeId, operation.pointId, operation.fields)
    }
  },
  'edge.delete': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addEdgeExists(ctx, op.id)
    }),
    apply: (ctx, operation) => {
      ctx.edge.delete(operation.id)
    }
  },
  'group.create': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'group.exists',
        groupId: op.group.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.group.create(operation.group)
    }
  },
  'group.restore': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'group.exists',
        groupId: op.group.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.group.restore(operation.group)
    }
  },
  'group.patch': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        ctx.add({
          kind: 'group.field',
          groupId: op.id,
          field: field as Extract<HistoryKey, { kind: 'group.field' }>['field']
        })
      })
    }),
    apply: (ctx, operation) => {
      ctx.group.patch(operation.id, operation.fields)
    }
  },
  'group.delete': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'group.exists',
        groupId: op.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.group.delete(operation.id)
    }
  },
  'mindmap.create': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.exists',
        mindmapId: op.mindmap.id
      })
      op.nodes.forEach((node) => addNodeExists(ctx, node.id))
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.create({
        mindmap: operation.mindmap,
        nodes: operation.nodes
      })
    }
  },
  'mindmap.restore': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.exists',
        mindmapId: op.snapshot.mindmap.id
      })
      op.snapshot.nodes.forEach((node) => addNodeExists(ctx, node.id))
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.restore(operation.snapshot)
    }
  },
  'mindmap.delete': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      const mindmap = ctx.read.mindmap(op.id)
      ctx.add({
        kind: 'mindmap.exists',
        mindmapId: op.id
      })
      if (!mindmap) {
        return
      }
      const nodeIds = new Set(readMindmapSubtreeNodeIds(ctx, op.id, mindmap.root))
      nodeIds.forEach((nodeId) => addNodeExists(ctx, nodeId))
      collectNodeSubtreeEdgeKeys(ctx, nodeIds)
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.delete(operation.id)
    }
  },
  'mindmap.move': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.layout',
        mindmapId: op.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.moveRoot(operation.id, operation.position)
    }
  },
  'mindmap.layout': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.layout',
        mindmapId: op.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.patchLayout(operation.id, operation.patch)
    }
  },
  'mindmap.topic.insert': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.structure',
        mindmapId: op.id
      })
      addNodeExists(ctx, op.node.id)
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.insertTopic({
        id: operation.id,
        topic: operation.node,
        value: operation.input
      })
    }
  },
  'mindmap.topic.restore': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.structure',
        mindmapId: op.id
      })
      op.snapshot.nodes.forEach((node) => addNodeExists(ctx, node.id))
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.restoreTopic({
        id: operation.id,
        snapshot: operation.snapshot
      })
    }
  },
  'mindmap.topic.move': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.structure',
        mindmapId: op.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.moveTopic({
        id: operation.id,
        value: operation.input
      })
    }
  },
  'mindmap.topic.delete': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.structure',
        mindmapId: op.id
      })
      const nodeIds = new Set(readMindmapSubtreeNodeIds(ctx, op.id, op.input.nodeId))
      nodeIds.forEach((nodeId) => addNodeExists(ctx, nodeId))
      collectNodeSubtreeEdgeKeys(ctx, nodeIds)
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.deleteTopic({
        id: operation.id,
        nodeId: operation.input.nodeId
      })
    }
  },
  'mindmap.topic.patch': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        ctx.add({
          kind: 'node.field',
          nodeId: op.topicId,
          field: field as Extract<HistoryKey, { kind: 'node.field' }>['field']
        })
      })
      toScopedRecordKeys(op.record).forEach((entry) => {
        ctx.add({
          kind: 'node.record',
          nodeId: op.topicId,
          scope: entry.scope,
          path: entry.path
        })
      })
      ctx.add({
        kind: 'mindmap.exists',
        mindmapId: op.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.patchTopic(operation.id, operation.topicId, {
        fields: operation.fields,
        record: operation.record
      })
    }
  },
  'mindmap.branch.patch': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        ctx.add({
          kind: 'mindmap.branch.field',
          mindmapId: op.id,
          topicId: op.topicId,
          field: field as Extract<HistoryKey, { kind: 'mindmap.branch.field' }>['field']
        })
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.patchBranch(operation.id, operation.topicId, operation.fields)
    }
  },
  'mindmap.topic.collapse': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      ctx.add({
        kind: 'mindmap.layout',
        mindmapId: op.id
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.setTopicCollapsed(operation.id, operation.topicId, operation.collapsed)
    }
  }
}
