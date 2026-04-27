import {
  CommandMutationSpec,
  type Origin as MutationOrigin
} from '@shared/mutation'
import { createId } from '@whiteboard/core/id'
import {
  compileWhiteboardIntents,
  type WhiteboardCompileIds,
  type WhiteboardIntent,
  type WhiteboardMutationTable
} from '@whiteboard/core/intent'
import {
  WHITEBOARD_OPERATION_DEFINITIONS,
  whiteboardMutationOperations
} from '@whiteboard/core/spec/operation'
import type { BoardConfig } from '@whiteboard/core/config'
import type {
  CoreRegistries,
  Document,
  EdgeId,
  GroupId,
  MindmapId,
  NodeId,
  Operation
} from '@whiteboard/core/types'
import type {
  EnginePublish
} from '../contracts/document'
import { normalizeDocument } from '@whiteboard/core/document/normalize'
import { whiteboardPublishSpec } from './publish'
import type {
  WhiteboardMutationExtra,
  WhiteboardMutationKey
} from './types'

interface WhiteboardHistoryConfig {
  enabled: boolean
  capacity: number
  captureSystem: boolean
  captureRemote: boolean
}

const DEFAULT_HISTORY_CONFIG: WhiteboardHistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
}

const shouldTrackOrigin = (
  origin: MutationOrigin,
  config: WhiteboardHistoryConfig
): boolean => {
  if (!config.enabled || origin === 'history') {
    return false
  }
  if (origin === 'system') {
    return config.captureSystem
  }
  if (origin === 'remote') {
    return config.captureRemote
  }
  return true
}

const shouldClearHistory = (
  write: {
    origin: MutationOrigin
    forward: readonly Operation[]
  },
  config: WhiteboardHistoryConfig
): boolean => shouldTrackOrigin(write.origin, config)
  && write.forward.some((op) => WHITEBOARD_OPERATION_DEFINITIONS[op.type].sync === 'checkpoint')

export type WhiteboardMutationSpec = CommandMutationSpec<
  Document,
  WhiteboardMutationTable,
  Operation,
  WhiteboardMutationKey,
  EnginePublish,
  void,
  WhiteboardMutationExtra
>

export const createWhiteboardMutationSpec = (input: {
  config: BoardConfig
  registries: CoreRegistries
}): WhiteboardMutationSpec => {
  const historyConfig = DEFAULT_HISTORY_CONFIG
  const ids: WhiteboardCompileIds = {
    node: (): NodeId => createId('node'),
    edge: (): EdgeId => createId('edge'),
    edgeLabel: (): string => createId('edge_label'),
    edgeRoutePoint: (): string => createId('edge_point'),
    group: (): GroupId => createId('group'),
    mindmap: (): MindmapId => createId('mindmap')
  }

  return {
    normalize: (doc) => normalizeDocument(doc, input.config),
    compile: ({
      doc,
      intents
    }) => compileWhiteboardIntents({
      document: doc,
      intents: intents as readonly WhiteboardIntent[],
      registries: input.registries,
      ids
    }),
    operations: whiteboardMutationOperations,
    publish: whiteboardPublishSpec,
    history: {
      capacity: historyConfig.capacity,
      track: ({
        origin
      }) => shouldTrackOrigin(origin, historyConfig),
      clear: ({
        origin,
        ops
      }) => shouldClearHistory({
        origin,
        forward: ops
      }, historyConfig)
    }
  }
}
