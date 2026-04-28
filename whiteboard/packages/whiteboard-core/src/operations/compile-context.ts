import type {
  MutationCompileCtx
} from '@shared/mutation'
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

export type WhiteboardCompileTx = {
  read: {
    document: {
      get: () => Document
    }
    canvas: {
      order: () => readonly import('@whiteboard/core/types').CanvasItemRef[]
    }
    node: {
      get: (id: NodeId) => Node | undefined
      require: (id: NodeId) => Node | undefined
    }
    edge: {
      get: (id: EdgeId) => Edge | undefined
      require: (id: EdgeId) => Edge | undefined
    }
    group: {
      get: (id: GroupId) => Group | undefined
      require: (id: GroupId) => Group | undefined
    }
    mindmap: {
      get: (id: MindmapId) => MindmapRecord | undefined
      require: (id: MindmapId) => MindmapRecord | undefined
    }
  }
  ids: WhiteboardCompileIds
  emit: (op: Operation) => void
  emitMany: (ops: readonly Operation[]) => void
  fail: {
    invalid: (message: string, details?: unknown) => ReturnType<MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>['block']>
    cancelled: (message: string, details?: unknown) => ReturnType<MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>['block']>
  }
}

export type WhiteboardIntentContext = {
  tx: WhiteboardCompileTx
  registries: CoreRegistries
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

export const createWhiteboardIntentContext = (input: {
  ctx: MutationCompileCtx<Document, Operation, 'invalid' | 'cancelled'>
  ids: WhiteboardCompileIds
  registries: CoreRegistries
}): WhiteboardIntentContext => ({
  tx: {
    read: {
      document: {
        get: () => input.ctx.doc()
      },
      canvas: {
        order: () => input.ctx.doc().canvas.order
      },
      node: {
        get: (id) => input.ctx.doc().nodes[id],
        require: (id) => requireNode(input.ctx, id)
      },
      edge: {
        get: (id) => input.ctx.doc().edges[id],
        require: (id) => requireEdge(input.ctx, id)
      },
      group: {
        get: (id) => input.ctx.doc().groups[id],
        require: (id) => requireGroup(input.ctx, id)
      },
      mindmap: {
        get: (id) => input.ctx.doc().mindmaps[id],
        require: (id) => requireMindmap(input.ctx, id)
      }
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
  },
  registries: input.registries
})
