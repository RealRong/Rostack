import type { MutationCompileCtx } from '@shared/mutation'
import type {
  CoreRegistries,
  Document,
  Edge,
  EdgeId,
  Group,
  GroupId,
  MindmapId,
  MindmapRecord,
  Node,
  NodeId,
  Operation
} from '@whiteboard/core/types'

export type WhiteboardCompileIds = {
  node: () => NodeId
  edge: () => EdgeId
  edgeLabel: () => string
  edgeRoutePoint: () => string
  group: () => GroupId
  mindmap: () => MindmapId
}

export type WhiteboardCompileScope = {
  registries: CoreRegistries
  read: {
    document: () => Document
    canvasOrder: () => readonly import('@whiteboard/core/types').CanvasItemRef[]
    node: (id: NodeId) => Node | undefined
    requireNode: (id: NodeId) => Node | undefined
    edge: (id: EdgeId) => Edge | undefined
    requireEdge: (id: EdgeId) => Edge | undefined
    group: (id: GroupId) => Group | undefined
    requireGroup: (id: GroupId) => Group | undefined
    mindmap: (id: MindmapId) => MindmapRecord | undefined
    requireMindmap: (id: MindmapId) => MindmapRecord | undefined
  }
  ids: WhiteboardCompileIds
  emit: (op: Operation) => void
  emitMany: (ops: readonly Operation[]) => void
  fail: {
    invalid: (
      message: string,
      details?: unknown
    ) => ReturnType<MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>['block']>
    cancelled: (
      message: string,
      details?: unknown
    ) => ReturnType<MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>['block']>
  }
}

const requireNode = (
  ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>,
  id: NodeId
): Node | undefined => {
  const node = ctx.doc().nodes[id]
  if (node) {
    return node
  }

  ctx.issue({
    code: 'invalid',
    message: `Node ${id} not found.`
  })
  return undefined
}

const requireEdge = (
  ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>,
  id: EdgeId
): Edge | undefined => {
  const edge = ctx.doc().edges[id]
  if (edge) {
    return edge
  }

  ctx.issue({
    code: 'invalid',
    message: `Edge ${id} not found.`
  })
  return undefined
}

const requireGroup = (
  ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>,
  id: GroupId
): Group | undefined => {
  const group = ctx.doc().groups[id]
  if (group) {
    return group
  }

  ctx.issue({
    code: 'invalid',
    message: `Group ${id} not found.`
  })
  return undefined
}

const requireMindmap = (
  ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>,
  id: MindmapId
): MindmapRecord | undefined => {
  const mindmap = ctx.doc().mindmaps[id]
  if (mindmap) {
    return mindmap
  }

  ctx.issue({
    code: 'invalid',
    message: `Mindmap ${id} not found.`
  })
  return undefined
}

export const createWhiteboardCompileScope = (input: {
  ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>
  ids: WhiteboardCompileIds
  registries: CoreRegistries
}): WhiteboardCompileScope => ({
  registries: input.registries,
  read: {
    document: () => input.ctx.doc(),
    canvasOrder: () => input.ctx.doc().canvas.order,
    node: (id) => input.ctx.doc().nodes[id],
    requireNode: (id) => requireNode(input.ctx, id),
    edge: (id) => input.ctx.doc().edges[id],
    requireEdge: (id) => requireEdge(input.ctx, id),
    group: (id) => input.ctx.doc().groups[id],
    requireGroup: (id) => requireGroup(input.ctx, id),
    mindmap: (id) => input.ctx.doc().mindmaps[id],
    requireMindmap: (id) => requireMindmap(input.ctx, id)
  },
  ids: input.ids,
  emit: input.ctx.emit,
  emitMany: (ops) => {
    input.ctx.emitMany(...ops)
  },
  fail: {
    invalid: (message, details) => input.ctx.block({
      code: 'invalid',
      message,
      details
    }),
    cancelled: (message, details) => input.ctx.block({
      code: 'cancelled',
      message,
      details
    })
  }
})
