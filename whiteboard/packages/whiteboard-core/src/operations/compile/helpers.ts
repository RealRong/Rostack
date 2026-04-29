import type {
  MutationCompileControl,
  MutationCompileHandlerTable
} from '@shared/mutation/engine'
import type {
  MutationCompileHandlerInput
} from '@shared/mutation/engine'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type {
  CanvasItemRef,
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
  Operation,
  ResultCode
} from '@whiteboard/core/types'
import type {
  OrderMode,
  WhiteboardIntent,
  WhiteboardIntentKind,
  WhiteboardIntentOutput,
  WhiteboardMutationTable
} from '@whiteboard/core/operations/intents'

export type WhiteboardCompileCode = ResultCode

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
  layout: WhiteboardLayoutService
}

export type WhiteboardCompileContext<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = MutationCompileHandlerInput<
  Document,
  WhiteboardIntent<K>,
  Operation,
  WhiteboardIntentOutput<K>,
  WhiteboardCompileServices,
  WhiteboardCompileCode
>

export type WhiteboardCompileHandlerTable = MutationCompileHandlerTable<
  WhiteboardMutationTable,
  Document,
  Operation,
  WhiteboardCompileServices,
  WhiteboardCompileCode
>

export const readCompileServices = (
  input: WhiteboardCompileContext
): WhiteboardCompileServices => {
  if (!input.services) {
    throw new Error('Whiteboard compile services are required.')
  }

  return input.services
}

export const readCompileRegistries = (
  input: WhiteboardCompileContext
): CoreRegistries => readCompileServices(input).registries

export const failInvalid = (
  input: WhiteboardCompileContext,
  message: string,
  details?: unknown
): MutationCompileControl<WhiteboardCompileCode> => input.fail({
  code: 'invalid',
  message,
  details
})

export const failCancelled = (
  input: WhiteboardCompileContext,
  message: string,
  details?: unknown
): MutationCompileControl<WhiteboardCompileCode> => input.fail({
  code: 'cancelled',
  message,
  details
})

export const requireNode = (
  input: WhiteboardCompileContext,
  id: NodeId
): Node | undefined => input.require(input.document.nodes[id], {
  code: 'invalid',
  message: `Node ${id} not found.`
})

export const requireEdge = (
  input: WhiteboardCompileContext,
  id: EdgeId
): Edge | undefined => input.require(input.document.edges[id], {
  code: 'invalid',
  message: `Edge ${id} not found.`
})

export const requireGroup = (
  input: WhiteboardCompileContext,
  id: GroupId
): Group | undefined => input.require(input.document.groups[id], {
  code: 'invalid',
  message: `Group ${id} not found.`
})

export const requireMindmap = (
  input: WhiteboardCompileContext,
  id: MindmapId
): MindmapRecord | undefined => input.require(input.document.mindmaps[id], {
  code: 'invalid',
  message: `Mindmap ${id} not found.`
})

const sameCanvasRef = (
  left: CanvasItemRef,
  right: CanvasItemRef
): boolean => left.kind === right.kind && left.id === right.id

export const reorderCanvasRefs = (
  current: readonly CanvasItemRef[],
  refs: readonly CanvasItemRef[],
  mode: OrderMode
): readonly CanvasItemRef[] => {
  const next = [...current]
  const selected = refs.filter((ref) => next.some((entry) => sameCanvasRef(entry, ref)))
  if (selected.length === 0) {
    return next
  }

  const isSelected = (entry: CanvasItemRef) =>
    selected.some((ref) => sameCanvasRef(ref, entry))

  if (mode === 'set') {
    return [...refs]
  }

  const rest = next.filter((entry) => !isSelected(entry))
  if (mode === 'front') {
    return [...rest, ...selected]
  }
  if (mode === 'back') {
    return [...selected, ...rest]
  }

  const items = [...next]
  if (mode === 'forward') {
    for (let index = items.length - 2; index >= 0; index -= 1) {
      if (isSelected(items[index]!) && !isSelected(items[index + 1]!)) {
        const currentEntry = items[index]!
        items[index] = items[index + 1]!
        items[index + 1] = currentEntry
      }
    }
    return items
  }

  for (let index = 1; index < items.length; index += 1) {
    if (isSelected(items[index]!) && !isSelected(items[index - 1]!)) {
      const currentEntry = items[index]!
      items[index] = items[index - 1]!
      items[index - 1] = currentEntry
    }
  }
  return items
}

export const createCanvasOrderMoveOps = (
  current: readonly CanvasItemRef[],
  target: readonly CanvasItemRef[]
): readonly Operation[] => {
  const working = [...current]
  const ops: Operation[] = []

  for (let index = 0; index < target.length; index += 1) {
    const ref = target[index]!
    if (sameCanvasRef(working[index] ?? { kind: ref.kind, id: '' }, ref)) {
      continue
    }

    const currentIndex = working.findIndex((entry) => sameCanvasRef(entry, ref))
    if (currentIndex < 0) {
      continue
    }

    working.splice(currentIndex, 1)
    working.splice(index, 0, ref)
    ops.push({
      type: 'canvas.order.move',
      refs: [ref],
      to: index === 0
        ? { kind: 'front' }
        : {
            kind: 'after',
            ref: target[index - 1]!
          }
    })
  }

  return ops
}
