import {
  MutationEngine,
  type MutationEngineSpec,
  type MutationOrigin
} from '@shared/mutation'
import { createId } from '@shared/core'
import {
  compile,
  type WhiteboardCompileIds,
  type WhiteboardCompileScope,
  type WhiteboardMutationTable
} from '@whiteboard/core/operations'
import {
  definitions,
  spec
} from '@whiteboard/core/operations'
import type { WhiteboardReduceCtx } from '@whiteboard/core/reducer/types'
import type { BoardConfig } from '@whiteboard/engine/config'
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
import { normalizeDocument } from '@whiteboard/core/document'
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
  commit: {
    origin: MutationOrigin
    forward: readonly Operation[]
  },
  config: WhiteboardHistoryConfig
): boolean => shouldTrackOrigin(commit.origin, config)
  && commit.forward.some((op) => definitions[op.type].sync === 'checkpoint')

export const createWhiteboardMutationSpec = (input: {
  config: BoardConfig
  registries: CoreRegistries
}): Omit<
  MutationEngineSpec<
    Document,
    WhiteboardMutationTable,
    Operation,
    WhiteboardMutationKey,
    EnginePublish,
    void,
    WhiteboardMutationExtra,
    void,
    WhiteboardReduceCtx,
    WhiteboardCompileScope
  >,
  'document'
> => {
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
    normalize: (doc) => normalizeDocument(doc),
    key: {
      serialize: spec.serializeKey,
      ...(spec.conflicts
        ? {
            conflicts: spec.conflicts
          }
        : {})
    },
    operations: spec.table,
    reduce: {
      ...(spec.createContext
        ? {
            createContext: spec.createContext
          }
        : {}),
      ...(spec.validate
        ? {
            validate: spec.validate
          }
        : {}),
      ...(spec.settle
        ? {
            settle: spec.settle
          }
        : {}),
      done: spec.done
    },
    compile: {
      handlers: compile.handlers,
      createContext: ({ ctx }) => compile.createContext({
        ctx,
        ids,
        registries: input.registries
      }),
      apply: ({
        doc,
        ops
      }) => {
        const reduced = MutationEngine.reduce({
          document: doc,
          ops,
          origin: 'system',
          operations: spec
        })

        return reduced.ok
          ? {
              ok: true as const,
              doc: reduced.doc
            }
          : {
              ok: false as const,
              issue: {
                code: reduced.error.code === 'cancelled'
                  ? 'cancelled'
                  : 'invalid',
                message: reduced.error.message,
                severity: 'error' as const,
                details: reduced.error.details
              }
            }
      }
    },
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
