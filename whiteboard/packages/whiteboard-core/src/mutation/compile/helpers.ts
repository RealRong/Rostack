import type {
  MutationWriter,
} from '@shared/mutation'
import type {
  MutationCompileControl,
  MutationCompileHandlerInput,
} from '@shared/mutation/engine'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import {
  whiteboardMutationSchema
} from '@whiteboard/core/mutation/model'
import {
  createWhiteboardQuery,
  type WhiteboardQuery,
  type WhiteboardReader,
} from '@whiteboard/core/query'
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

export type WhiteboardCompileCode = string

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

export type WhiteboardCompileContext<
  TIntent extends WhiteboardIntent = WhiteboardIntent
> = MutationCompileHandlerInput<
  Document,
  TIntent,
  MutationWriter<typeof whiteboardMutationSchema>,
  WhiteboardReader,
  WhiteboardCompileServices,
  WhiteboardCompileCode
> & {
  query: WhiteboardQuery
  expect: WhiteboardCompileExpect
}

export type WhiteboardCompileIntent<
  K extends WhiteboardIntentKind
> = Extract<WhiteboardIntent, { type: K }>

export type WhiteboardCompileHandler<
  K extends WhiteboardIntentKind = WhiteboardIntentKind
> = (
  input: WhiteboardCompileContext<WhiteboardCompileIntent<K>>
) => unknown | void | MutationCompileControl<WhiteboardCompileCode>

export type WhiteboardCompileHandlerTable = {
  [K in WhiteboardIntentKind]: WhiteboardCompileHandler<K>
}

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

const createCompileExpect = (
  input: MutationCompileHandlerInput<
    Document,
    WhiteboardIntent,
    MutationWriter<typeof whiteboardMutationSchema>,
    WhiteboardReader,
    WhiteboardCompileServices,
    WhiteboardCompileCode
  >
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

export const createCompileContext = (
  input: MutationCompileHandlerInput<
    Document,
    {
      type: string
    },
    MutationWriter<typeof whiteboardMutationSchema>,
    WhiteboardReader,
    WhiteboardCompileServices,
    WhiteboardCompileCode
  >
) => ({
  query: createWhiteboardQuery(input.reader),
  expect: createCompileExpect(
    input as MutationCompileHandlerInput<
      Document,
      WhiteboardIntent,
      MutationWriter<typeof whiteboardMutationSchema>,
      WhiteboardReader,
      WhiteboardCompileServices,
      WhiteboardCompileCode
    >
  ),
})
