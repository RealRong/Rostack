import type {
  MutationCompileControl
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
import type {
  WhiteboardIntent
} from '@whiteboard/core/operations/intent-types'
import type {
  WhiteboardCompileCode,
  WhiteboardCompileControls
} from '@whiteboard/core/operations/compile/contracts'

export type WhiteboardCompileIds = {
  node: () => NodeId
  edge: () => EdgeId
  edgeLabel: () => string
  edgeRoutePoint: () => string
  group: () => GroupId
  mindmap: () => MindmapId
}

export type WhiteboardCompileServices = {
  ids: WhiteboardCompileIds
  registries: CoreRegistries
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
    ) => MutationCompileControl<WhiteboardCompileCode>
    cancelled: (
      message: string,
      details?: unknown
    ) => MutationCompileControl<WhiteboardCompileCode>
  }
}

type WhiteboardCompileInput<
  TIntent extends WhiteboardIntent = WhiteboardIntent
> = WhiteboardCompileControls<
  TIntent['type'] & import('@whiteboard/core/operations/intent-types').WhiteboardIntentKind
>

const requireNode = (
  input: WhiteboardCompileInput,
  id: NodeId
): Node | undefined => {
  const node = input.document.nodes[id]
  if (node) {
    return node
  }

  input.issue({
    code: 'invalid',
    message: `Node ${id} not found.`
  })
  return undefined
}

const requireEdge = (
  input: WhiteboardCompileInput,
  id: EdgeId
): Edge | undefined => {
  const edge = input.document.edges[id]
  if (edge) {
    return edge
  }

  input.issue({
    code: 'invalid',
    message: `Edge ${id} not found.`
  })
  return undefined
}

const requireGroup = (
  input: WhiteboardCompileInput,
  id: GroupId
): Group | undefined => {
  const group = input.document.groups[id]
  if (group) {
    return group
  }

  input.issue({
    code: 'invalid',
    message: `Group ${id} not found.`
  })
  return undefined
}

const requireMindmap = (
  input: WhiteboardCompileInput,
  id: MindmapId
): MindmapRecord | undefined => {
  const mindmap = input.document.mindmaps[id]
  if (mindmap) {
    return mindmap
  }

  input.issue({
    code: 'invalid',
    message: `Mindmap ${id} not found.`
  })
  return undefined
}

const readCompileServices = (
  input: WhiteboardCompileInput
): WhiteboardCompileServices => {
  if (!input.services) {
    throw new Error('Whiteboard compile services are required.')
  }

  return input.services
}

export const createWhiteboardCompileScope = <
  TIntent extends WhiteboardIntent = WhiteboardIntent
>(input: {
  controls: WhiteboardCompileInput<TIntent>
}): WhiteboardCompileScope => {
  const services = readCompileServices(input.controls)

  return {
    registries: services.registries,
    read: {
      document: () => input.controls.document,
      canvasOrder: () => input.controls.document.canvas.order,
      node: (id) => input.controls.document.nodes[id],
      requireNode: (id) => requireNode(input.controls, id),
      edge: (id) => input.controls.document.edges[id],
      requireEdge: (id) => requireEdge(input.controls, id),
      group: (id) => input.controls.document.groups[id],
      requireGroup: (id) => requireGroup(input.controls, id),
      mindmap: (id) => input.controls.document.mindmaps[id],
      requireMindmap: (id) => requireMindmap(input.controls, id)
    },
    ids: services.ids,
    emit: input.controls.emit,
    emitMany: (ops) => {
      input.controls.emitMany(...ops)
    },
    fail: {
      invalid: (message, details) => input.controls.fail({
        code: 'invalid',
        message,
        details
      }),
      cancelled: (message, details) => input.controls.fail({
        code: 'cancelled',
        message,
        details
      })
    }
  }
}
