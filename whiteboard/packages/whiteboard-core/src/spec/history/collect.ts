import { mindmap as mindmapApi } from '@whiteboard/core/mindmap'
import type {
  Edge,
  Group,
  MindmapRecord,
  Node,
  NodeOwner,
  Operation
} from '@whiteboard/core/types'
import type { MindmapTree, EdgeId, GroupId, MindmapId, NodeId } from '@whiteboard/core/types'
import type { HistoryKey } from '@whiteboard/core/spec/history/key'

export interface WhiteboardHistoryRead {
  node(id: NodeId): Node | undefined
  edge(id: EdgeId): Edge | undefined
  group(id: GroupId): Group | undefined
  mindmap(id: MindmapId): MindmapRecord | undefined
  mindmapTree(id: MindmapId | NodeId): MindmapTree | undefined
  connectedEdges(nodeIds: ReadonlySet<NodeId>): readonly Edge[]
}

export type HistoryCollectContext = {
  read: WhiteboardHistoryRead
  add(key: HistoryKey): void
  addMany(keys: readonly HistoryKey[]): void
}

export type OperationHistoryCollector<K extends Operation['type'] = Operation['type']> = (
  ctx: HistoryCollectContext,
  op: Extract<Operation, { type: K }>
) => void

export type OperationHistoryRegistry = {
  [K in Operation['type']]: OperationHistoryCollector<K>
}

const addOwnerMindmap = (
  ctx: HistoryCollectContext,
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
  ctx: HistoryCollectContext,
  nodeId: string
) => {
  ctx.add({
    kind: 'node.exists',
    nodeId
  })
}

const addEdgeExists = (
  ctx: HistoryCollectContext,
  edgeId: string
) => {
  ctx.add({
    kind: 'edge.exists',
    edgeId
  })
}

const collectNodeSubtreeEdgeKeys = (
  ctx: HistoryCollectContext,
  nodeIds: ReadonlySet<NodeId>
) => {
  const connectedEdges = ctx.read.connectedEdges(nodeIds)
  connectedEdges.forEach((edge) => addEdgeExists(ctx, edge.id))
}

const readMindmapSubtreeNodeIds = (
  ctx: HistoryCollectContext,
  mindmapId: MindmapId,
  rootId: NodeId
): readonly NodeId[] => {
  const tree = ctx.read.mindmapTree(mindmapId)
  return tree
    ? mindmapApi.tree.subtreeIds(tree, rootId)
    : []
}

const readNodeOwner = (
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

const COLLECTORS: OperationHistoryRegistry = {
  'document.replace': () => {},
  'document.background': (ctx) => {
    ctx.add({
      kind: 'document.background'
    })
  },
  'canvas.order.move': (ctx) => {
    ctx.add({
      kind: 'canvas.order'
    })
  },
  'node.create': (ctx, op) => {
    addNodeExists(ctx, op.node.id)
    addOwnerMindmap(ctx, op.node.owner)
  },
  'node.restore': (ctx, op) => {
    addNodeExists(ctx, op.node.id)
    addOwnerMindmap(ctx, op.node.owner)
  },
  'node.field.set': (ctx, op) => {
    const node = ctx.read.node(op.id)
    ctx.add({
      kind: 'node.field',
      nodeId: op.id,
      field: op.field
    })
    readNodeOwner(
      node,
      op.field === 'owner'
        ? op.value as NodeOwner
        : undefined
    ).forEach((owner) => addOwnerMindmap(ctx, owner))
  },
  'node.field.unset': (ctx, op) => {
    const node = ctx.read.node(op.id)
    ctx.add({
      kind: 'node.field',
      nodeId: op.id,
      field: op.field
    })
    addOwnerMindmap(ctx, node?.owner)
  },
  'node.record.set': (ctx, op) => {
    const node = ctx.read.node(op.id)
    ctx.add({
      kind: 'node.record',
      nodeId: op.id,
      scope: op.scope,
      path: op.path
    })
    addOwnerMindmap(ctx, node?.owner)
  },
  'node.record.unset': (ctx, op) => {
    const node = ctx.read.node(op.id)
    ctx.add({
      kind: 'node.record',
      nodeId: op.id,
      scope: op.scope,
      path: op.path
    })
    addOwnerMindmap(ctx, node?.owner)
  },
  'node.delete': (ctx, op) => {
    const node = ctx.read.node(op.id)
    addNodeExists(ctx, op.id)
    addOwnerMindmap(ctx, node?.owner)
  },
  'edge.create': (ctx, op) => {
    addEdgeExists(ctx, op.edge.id)
  },
  'edge.restore': (ctx, op) => {
    addEdgeExists(ctx, op.edge.id)
  },
  'edge.field.set': (ctx, op) => {
    ctx.add({
      kind: 'edge.field',
      edgeId: op.id,
      field: op.field
    })
  },
  'edge.field.unset': (ctx, op) => {
    ctx.add({
      kind: 'edge.field',
      edgeId: op.id,
      field: op.field
    })
  },
  'edge.record.set': (ctx, op) => {
    ctx.add({
      kind: 'edge.record',
      edgeId: op.id,
      scope: op.scope,
      path: op.path
    })
  },
  'edge.record.unset': (ctx, op) => {
    ctx.add({
      kind: 'edge.record',
      edgeId: op.id,
      scope: op.scope,
      path: op.path
    })
  },
  'edge.label.insert': (ctx, op) => {
    ctx.add({
      kind: 'edge.labels',
      edgeId: op.edgeId
    })
    ctx.add({
      kind: 'edge.label.exists',
      edgeId: op.edgeId,
      labelId: op.label.id
    })
  },
  'edge.label.delete': (ctx, op) => {
    ctx.add({
      kind: 'edge.labels',
      edgeId: op.edgeId
    })
    ctx.add({
      kind: 'edge.label.exists',
      edgeId: op.edgeId,
      labelId: op.labelId
    })
  },
  'edge.label.move': (ctx, op) => {
    ctx.add({
      kind: 'edge.labels',
      edgeId: op.edgeId
    })
    ctx.add({
      kind: 'edge.label.exists',
      edgeId: op.edgeId,
      labelId: op.labelId
    })
  },
  'edge.label.field.set': (ctx, op) => {
    ctx.add({
      kind: 'edge.label.field',
      edgeId: op.edgeId,
      labelId: op.labelId,
      field: op.field
    })
  },
  'edge.label.field.unset': (ctx, op) => {
    ctx.add({
      kind: 'edge.label.field',
      edgeId: op.edgeId,
      labelId: op.labelId,
      field: op.field
    })
  },
  'edge.label.record.set': (ctx, op) => {
    ctx.add({
      kind: 'edge.label.record',
      edgeId: op.edgeId,
      labelId: op.labelId,
      scope: op.scope,
      path: op.path
    })
  },
  'edge.label.record.unset': (ctx, op) => {
    ctx.add({
      kind: 'edge.label.record',
      edgeId: op.edgeId,
      labelId: op.labelId,
      scope: op.scope,
      path: op.path
    })
  },
  'edge.route.point.insert': (ctx, op) => {
    ctx.add({
      kind: 'edge.route',
      edgeId: op.edgeId
    })
    ctx.add({
      kind: 'edge.route.point',
      edgeId: op.edgeId,
      pointId: op.point.id
    })
  },
  'edge.route.point.delete': (ctx, op) => {
    ctx.add({
      kind: 'edge.route',
      edgeId: op.edgeId
    })
    ctx.add({
      kind: 'edge.route.point',
      edgeId: op.edgeId,
      pointId: op.pointId
    })
  },
  'edge.route.point.move': (ctx, op) => {
    ctx.add({
      kind: 'edge.route',
      edgeId: op.edgeId
    })
    ctx.add({
      kind: 'edge.route.point',
      edgeId: op.edgeId,
      pointId: op.pointId
    })
  },
  'edge.route.point.field.set': (ctx, op) => {
    ctx.add({
      kind: 'edge.route.point',
      edgeId: op.edgeId,
      pointId: op.pointId
    })
  },
  'edge.delete': (ctx, op) => {
    addEdgeExists(ctx, op.id)
  },
  'group.create': (ctx, op) => {
    ctx.add({
      kind: 'group.exists',
      groupId: op.group.id
    })
  },
  'group.restore': (ctx, op) => {
    ctx.add({
      kind: 'group.exists',
      groupId: op.group.id
    })
  },
  'group.field.set': (ctx, op) => {
    ctx.add({
      kind: 'group.field',
      groupId: op.id,
      field: op.field
    })
  },
  'group.field.unset': (ctx, op) => {
    ctx.add({
      kind: 'group.field',
      groupId: op.id,
      field: op.field
    })
  },
  'group.delete': (ctx, op) => {
    ctx.add({
      kind: 'group.exists',
      groupId: op.id
    })
  },
  'mindmap.create': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: op.mindmap.id
    })
    op.nodes.forEach((node) => addNodeExists(ctx, node.id))
  },
  'mindmap.restore': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: op.snapshot.mindmap.id
    })
    op.snapshot.nodes.forEach((node) => addNodeExists(ctx, node.id))
  },
  'mindmap.delete': (ctx, op) => {
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
  },
  'mindmap.move': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.layout',
      mindmapId: op.id
    })
  },
  'mindmap.layout': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.layout',
      mindmapId: op.id
    })
  },
  'mindmap.topic.insert': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.structure',
      mindmapId: op.id
    })
    addNodeExists(ctx, op.node.id)
  },
  'mindmap.topic.restore': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.structure',
      mindmapId: op.id
    })
    op.snapshot.nodes.forEach((node) => addNodeExists(ctx, node.id))
  },
  'mindmap.topic.move': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.structure',
      mindmapId: op.id
    })
  },
  'mindmap.topic.delete': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.structure',
      mindmapId: op.id
    })
    const nodeIds = new Set(readMindmapSubtreeNodeIds(ctx, op.id, op.input.nodeId))
    nodeIds.forEach((nodeId) => addNodeExists(ctx, nodeId))
    collectNodeSubtreeEdgeKeys(ctx, nodeIds)
  },
  'mindmap.topic.field.set': (ctx, op) => {
    ctx.add({
      kind: 'node.field',
      nodeId: op.topicId,
      field: op.field
    })
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: op.id
    })
  },
  'mindmap.topic.field.unset': (ctx, op) => {
    ctx.add({
      kind: 'node.field',
      nodeId: op.topicId,
      field: op.field
    })
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: op.id
    })
  },
  'mindmap.topic.record.set': (ctx, op) => {
    ctx.add({
      kind: 'node.record',
      nodeId: op.topicId,
      scope: op.scope,
      path: op.path
    })
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: op.id
    })
  },
  'mindmap.topic.record.unset': (ctx, op) => {
    ctx.add({
      kind: 'node.record',
      nodeId: op.topicId,
      scope: op.scope,
      path: op.path
    })
    ctx.add({
      kind: 'mindmap.exists',
      mindmapId: op.id
    })
  },
  'mindmap.branch.field.set': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.branch.field',
      mindmapId: op.id,
      topicId: op.topicId,
      field: op.field
    })
  },
  'mindmap.branch.field.unset': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.branch.field',
      mindmapId: op.id,
      topicId: op.topicId,
      field: op.field
    })
  },
  'mindmap.topic.collapse': (ctx, op) => {
    ctx.add({
      kind: 'mindmap.layout',
      mindmapId: op.id
    })
  }
}

export const collect = {
  operation: (
    ctx: HistoryCollectContext,
    op: Operation
  ): void => {
    COLLECTORS[op.type](ctx as never, op as never)
  }
}
