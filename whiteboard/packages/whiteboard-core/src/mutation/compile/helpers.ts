import type {
  MutationWriter,
} from '@shared/mutation'
import type {
  MutationCompileHandlerInput,
  MutationCompileHandlerTable,
} from '@shared/mutation/engine'
import type { WhiteboardLayoutService } from '@whiteboard/core/layout'
import {
  whiteboardMutationModel
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
  WhiteboardIntentOutput,
  WhiteboardMutationTable
} from '@whiteboard/core/mutation/intents'
import type {
  WhiteboardCompileReader
} from './reader'

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
  MutationWriter<typeof whiteboardMutationModel>,
  WhiteboardIntentOutput<K>,
  WhiteboardCompileReader,
  WhiteboardCompileServices,
  WhiteboardCompileCode
>

export type WhiteboardCompileHandlerTable = MutationCompileHandlerTable<
  WhiteboardMutationTable,
  Document,
  MutationWriter<typeof whiteboardMutationModel>,
  WhiteboardCompileReader,
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
