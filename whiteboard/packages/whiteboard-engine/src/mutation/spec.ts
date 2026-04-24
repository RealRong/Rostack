import {
  MutationEngineSpec,
  type Origin as MutationOrigin
} from '@shared/mutation'
import { createId } from '@whiteboard/core/id'
import { historyKeyConflicts } from '@whiteboard/core/spec/history'
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
  EngineHistoryConfig,
  EnginePublish
} from '../contracts/document'
import { normalizeDocument } from '../document/normalize'
import type {
  Intent,
  WhiteboardMutationTable
} from '../types/intent'
import { applyWhiteboardOperations } from './apply'
import { compileIntents } from './compile'
import { whiteboardPublishSpec } from './publish'
import type {
  WhiteboardMutationExtra,
  WhiteboardMutationKey
} from './types'

export const DEFAULT_ENGINE_HISTORY_CONFIG: EngineHistoryConfig = {
  enabled: true,
  capacity: 100,
  captureSystem: false,
  captureRemote: false
}

const resolveEngineHistoryConfig = (
  config?: Partial<EngineHistoryConfig>
): EngineHistoryConfig => ({
  ...DEFAULT_ENGINE_HISTORY_CONFIG,
  ...(config ?? {})
})

const shouldTrackOrigin = (
  origin: MutationOrigin,
  config: EngineHistoryConfig
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

const toKernelOrigin = (
  origin: MutationOrigin
): import('@whiteboard/core/types').Origin => (
  origin === 'remote'
  || origin === 'system'
    ? origin
    : 'user'
)

export type WhiteboardMutationSpec = MutationEngineSpec<
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
  history?: Partial<EngineHistoryConfig>
}): WhiteboardMutationSpec => {
  const historyConfig = resolveEngineHistoryConfig(input.history)
  const ids = {
    node: (): NodeId => createId('node'),
    edge: (): EdgeId => createId('edge'),
    edgeLabel: (): string => createId('edge_label'),
    edgeRoutePoint: (): string => createId('edge_point'),
    group: (): GroupId => createId('group'),
    mindmap: (): MindmapId => createId('mindmap')
  }

  return {
    clone: (doc) => doc,
    normalize: (doc) => normalizeDocument(doc, input.config),
    compile: ({
      doc,
      intents
    }) => compileIntents({
      document: doc,
      intents: intents as readonly Intent[],
      registries: input.registries,
      ids,
      nodeSize: input.config.nodeSize
    }),
    apply: ({
      doc,
      ops,
      origin
    }) => applyWhiteboardOperations(doc, ops, toKernelOrigin(origin)),
    publish: whiteboardPublishSpec,
    history: {
      capacity: historyConfig.capacity,
      track: (write) => shouldTrackOrigin(write.origin, historyConfig),
      conflicts: historyKeyConflicts
    }
  }
}
