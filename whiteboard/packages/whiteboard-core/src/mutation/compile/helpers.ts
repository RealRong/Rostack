import type {
  MutationIssue,
} from '@shared/mutation'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import type {
  WhiteboardMutationDelta,
} from '@whiteboard/core/mutation/model'
import type {
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  ResultCode
} from '@whiteboard/core/types'
import type {
  WhiteboardIntent,
  WhiteboardIntentKind,
} from '@whiteboard/core/mutation/intents'
import type {
  WhiteboardQuery,
  WhiteboardReader,
} from '@whiteboard/core/query'
import type {
  WhiteboardWriter
} from '@whiteboard/core/mutation/write'

export type WhiteboardCompileCode =
  | 'invalid'
  | 'cancelled'
  | string

export type WhiteboardCompileAbort = {
  kind: 'invalid' | 'cancelled'
}

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

export type WhiteboardCompileExpect = {
  node(id: NodeId): Document['nodes'][NodeId] | undefined
  edge(id: EdgeId): Document['edges'][EdgeId] | undefined
  group(id: GroupId): Document['groups'][GroupId] | undefined
  mindmap(id: MindmapId): Document['mindmaps'][MindmapId] | undefined
}

export interface WhiteboardCompileIssue extends MutationIssue {
  code: WhiteboardCompileCode
}

export interface WhiteboardCompileContext<
  TIntent extends WhiteboardIntent = WhiteboardIntent
> {
  intent: TIntent
  document: Document
  reader: WhiteboardReader
  writer: WhiteboardWriter
  query: WhiteboardQuery
  change: WhiteboardMutationDelta
  issue: ((issue: WhiteboardCompileIssue & Record<string, unknown>) => void) & {
    add(issue: WhiteboardCompileIssue): void
    all(): readonly MutationIssue[]
    hasErrors(): boolean
  }
  services: WhiteboardCompileServices
  expect: WhiteboardCompileExpect
  invalid(message: string, details?: unknown): WhiteboardCompileAbort
  cancelled(message: string, details?: unknown): WhiteboardCompileAbort
}

export type WhiteboardCompileIntent<
  K extends WhiteboardIntentKind
> = Extract<WhiteboardIntent, { type: K }>

export type WhiteboardCompileHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = (
  input: WhiteboardCompileContext<WhiteboardCompileIntent<K>>
) => unknown | void | WhiteboardCompileAbort

export type WhiteboardCompileHandlerTable = {
  [K in WhiteboardIntentKind]: WhiteboardCompileHandler<K>
}

export const readCompileServices = (
  input: Pick<WhiteboardCompileContext, 'services'>
): WhiteboardCompileServices => input.services

export const readCompileRegistries = (
  input: Pick<WhiteboardCompileContext, 'services'>
): CoreRegistries => input.services.registries

export const createCompileExpect = (
  input: Pick<WhiteboardCompileContext, 'reader' | 'invalid'>
): WhiteboardCompileExpect => ({
  node: (id) => {
    const node = input.reader.node.get(id)
    if (node) {
      return node
    }

    input.invalid(`Node ${id} not found.`)
    return undefined
  },
  edge: (id) => {
    const edge = input.reader.edge.get(id)
    if (edge) {
      return edge
    }

    input.invalid(`Edge ${id} not found.`)
    return undefined
  },
  group: (id) => {
    const group = input.reader.group.get(id)
    if (group) {
      return group
    }

    input.invalid(`Group ${id} not found.`)
    return undefined
  },
  mindmap: (id) => {
    const mindmap = input.reader.mindmap.get(id)
    if (mindmap) {
      return mindmap
    }

    input.invalid(`Mindmap ${id} not found.`)
    return undefined
  },
})
