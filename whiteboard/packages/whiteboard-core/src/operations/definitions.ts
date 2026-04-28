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

const addEntityKey = (
  ctx: WhiteboardFootprintContext,
  family: string,
  id: string
) => {
  ctx.add({
    kind: 'entity',
    family,
    id
  })
}

const addFieldKey = (
  ctx: WhiteboardFootprintContext,
  family: string,
  id: string,
  field: string
) => {
  ctx.add({
    kind: 'field',
    family,
    id,
    field
  })
}

const addRecordKey = (
  ctx: WhiteboardFootprintContext,
  family: string,
  id: string,
  scope: string,
  path: string
) => {
  ctx.add({
    kind: 'record',
    family,
    id,
    scope,
    path
  })
}

const addRelationKey = (
  ctx: WhiteboardFootprintContext,
  family: string,
  id: string,
  relation: string,
  target?: string
) => {
  ctx.add({
    kind: 'relation',
    family,
    id,
    relation,
    ...(target === undefined
      ? {}
      : {
          target
        })
  })
}

const addOwnerMindmap = (
  ctx: WhiteboardFootprintContext,
  owner: NodeOwner | undefined
) => {
  if (owner?.kind === 'mindmap') {
    addEntityKey(ctx, 'mindmap', owner.id)
  }
}

const addNodeExists = (
  ctx: WhiteboardFootprintContext,
  nodeId: string
) => {
  addEntityKey(ctx, 'node', nodeId)
}

const addEdgeExists = (
  ctx: WhiteboardFootprintContext,
  edgeId: string
) => {
  addEntityKey(ctx, 'edge', edgeId)
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

const toScopedRecordKeys = (
  record?: Readonly<Record<string, unknown>>
): ReadonlyArray<{
  scope: 'data' | 'style'
  path: string
}> => Object.keys(record ?? {}).flatMap<{
  scope: 'data' | 'style'
  path: string
}>((path) => {
  if (path === 'data' || path.startsWith('data.')) {
    return [{
      scope: 'data',
      path: path === 'data'
        ? ''
        : path.slice('data.'.length)
    }]
  }
  if (path === 'style' || path.startsWith('style.')) {
    return [{
      scope: 'style',
      path: path === 'style'
        ? ''
        : path.slice('style.'.length)
    }]
  }
  return []
})

const addScopedRecordKeys = (
  ctx: WhiteboardFootprintContext,
  family: string,
  id: string,
  record?: Readonly<Record<string, unknown>>
) => {
  toScopedRecordKeys(record).forEach((entry) => {
    if (entry.path === '') {
      addFieldKey(ctx, family, id, entry.scope)
      return
    }

    addRecordKey(ctx, family, id, entry.scope, entry.path)
  })
}

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
      addFieldKey(ctx, 'document', 'document', 'background')
    }),
    apply: (ctx, operation) => {
      ctx.document.setBackground(operation.background)
    }
  },
  'canvas.order.move': {
    family: 'document',
    footprint: defineFootprint((ctx) => {
      addFieldKey(ctx, 'document', 'document', 'canvas.order')
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
        addFieldKey(ctx, 'node', op.id, field)
      })
      addScopedRecordKeys(ctx, 'node', op.id, op.record)
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
        addFieldKey(ctx, 'edge', op.id, field)
      })
      addScopedRecordKeys(ctx, 'edge', op.id, op.record)
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
      addRelationKey(ctx, 'edge', op.edgeId, 'labels')
      addRelationKey(ctx, 'edge', op.edgeId, 'labels', op.label.id)
    }),
    apply: (ctx, operation) => {
      ctx.edge.insertLabel(operation.edgeId, operation.label, toOrderedAnchor(operation.to))
    }
  },
  'edge.label.delete': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addRelationKey(ctx, 'edge', op.edgeId, 'labels')
      addRelationKey(ctx, 'edge', op.edgeId, 'labels', op.labelId)
    }),
    apply: (ctx, operation) => {
      ctx.edge.deleteLabel(operation.edgeId, operation.labelId)
    }
  },
  'edge.label.move': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addRelationKey(ctx, 'edge', op.edgeId, 'labels')
      addRelationKey(ctx, 'edge', op.edgeId, 'labels', op.labelId)
    }),
    apply: (ctx, operation) => {
      ctx.edge.moveLabel(operation.edgeId, operation.labelId, toOrderedAnchor(operation.to))
    }
  },
  'edge.label.patch': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        addFieldKey(ctx, 'edge', op.edgeId, `labels.${op.labelId}.${field}`)
      })
      toScopedRecordKeys(op.record).forEach((entry) => {
        const scope = `labels.${op.labelId}.${entry.scope}`
        if (entry.path === '') {
          addFieldKey(ctx, 'edge', op.edgeId, scope)
          return
        }

        addRecordKey(ctx, 'edge', op.edgeId, scope, entry.path)
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
      addRelationKey(ctx, 'edge', op.edgeId, 'route')
      addRelationKey(ctx, 'edge', op.edgeId, 'route', op.point.id)
    }),
    apply: (ctx, operation) => {
      ctx.edge.insertRoutePoint(operation.edgeId, operation.point, toOrderedAnchor(operation.to))
    }
  },
  'edge.route.point.delete': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addRelationKey(ctx, 'edge', op.edgeId, 'route')
      addRelationKey(ctx, 'edge', op.edgeId, 'route', op.pointId)
    }),
    apply: (ctx, operation) => {
      ctx.edge.deleteRoutePoint(operation.edgeId, operation.pointId)
    }
  },
  'edge.route.point.move': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addRelationKey(ctx, 'edge', op.edgeId, 'route')
      addRelationKey(ctx, 'edge', op.edgeId, 'route', op.pointId)
    }),
    apply: (ctx, operation) => {
      ctx.edge.moveRoutePoint(operation.edgeId, operation.pointId, toOrderedAnchor(operation.to))
    }
  },
  'edge.route.point.patch': {
    family: 'edge',
    footprint: defineFootprint((ctx, op) => {
      addRelationKey(ctx, 'edge', op.edgeId, 'route', op.pointId)
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
      addEntityKey(ctx, 'group', op.group.id)
    }),
    apply: (ctx, operation) => {
      ctx.group.create(operation.group)
    }
  },
  'group.restore': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      addEntityKey(ctx, 'group', op.group.id)
    }),
    apply: (ctx, operation) => {
      ctx.group.restore(operation.group)
    }
  },
  'group.patch': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      Object.keys(op.fields ?? {}).forEach((field) => {
        addFieldKey(ctx, 'group', op.id, field)
      })
    }),
    apply: (ctx, operation) => {
      ctx.group.patch(operation.id, operation.fields)
    }
  },
  'group.delete': {
    family: 'group',
    footprint: defineFootprint((ctx, op) => {
      addEntityKey(ctx, 'group', op.id)
    }),
    apply: (ctx, operation) => {
      ctx.group.delete(operation.id)
    }
  },
  'mindmap.create': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      addEntityKey(ctx, 'mindmap', op.mindmap.id)
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
      addEntityKey(ctx, 'mindmap', op.snapshot.mindmap.id)
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
      addEntityKey(ctx, 'mindmap', op.id)
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
      addFieldKey(ctx, 'mindmap', op.id, 'layout')
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.moveRoot(operation.id, operation.position)
    }
  },
  'mindmap.layout': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      addFieldKey(ctx, 'mindmap', op.id, 'layout')
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.patchLayout(operation.id, operation.patch)
    }
  },
  'mindmap.topic.insert': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      addFieldKey(ctx, 'mindmap', op.id, 'structure')
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
      addFieldKey(ctx, 'mindmap', op.id, 'structure')
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
      addFieldKey(ctx, 'mindmap', op.id, 'structure')
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
      addFieldKey(ctx, 'mindmap', op.id, 'structure')
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
        addFieldKey(ctx, 'node', op.topicId, field)
      })
      addScopedRecordKeys(ctx, 'node', op.topicId, op.record)
      addEntityKey(ctx, 'mindmap', op.id)
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
        addFieldKey(ctx, 'mindmap', op.id, `branch.${op.topicId}.${field}`)
      })
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.patchBranch(operation.id, operation.topicId, operation.fields)
    }
  },
  'mindmap.topic.collapse': {
    family: 'mindmap',
    footprint: defineFootprint((ctx, op) => {
      addFieldKey(ctx, 'mindmap', op.id, 'layout')
    }),
    apply: (ctx, operation) => {
      ctx.mindmap.setTopicCollapsed(operation.id, operation.topicId, operation.collapsed)
    }
  }
}
