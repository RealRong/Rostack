import type {
  MutationCompileControl,
  MutationCompileHandlerTable
} from '@shared/mutation/engine'
import type {
  MutationCompileHandlerInput
} from '@shared/mutation/engine'
import type {
  DocumentReader
} from '@whiteboard/core/document/reader'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
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
  ResultCode
} from '@whiteboard/core/types'
import type {
  WhiteboardInternalOperation
} from '@whiteboard/core/operations/internal'
export type {
  WhiteboardInternalOperation
} from '@whiteboard/core/operations/internal'
import type {
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
  WhiteboardInternalOperation,
  WhiteboardIntentOutput<K>,
  DocumentReader,
  WhiteboardCompileServices,
  WhiteboardCompileCode
>

export type WhiteboardCompileHandlerTable = MutationCompileHandlerTable<
  WhiteboardMutationTable,
  Document,
  WhiteboardInternalOperation,
  DocumentReader,
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
): Node | undefined => input.require(input.reader.nodes.get(id), {
  code: 'invalid',
  message: `Node ${id} not found.`
})

export const requireEdge = (
  input: WhiteboardCompileContext,
  id: EdgeId
): Edge | undefined => input.require(input.reader.edges.get(id), {
  code: 'invalid',
  message: `Edge ${id} not found.`
})

export const requireGroup = (
  input: WhiteboardCompileContext,
  id: GroupId
): Group | undefined => input.require(input.reader.groups.get(id), {
  code: 'invalid',
  message: `Group ${id} not found.`
})

export const requireMindmap = (
  input: WhiteboardCompileContext,
  id: MindmapId
): MindmapRecord | undefined => input.require(input.reader.mindmaps.get(id), {
  code: 'invalid',
  message: `Mindmap ${id} not found.`
})
