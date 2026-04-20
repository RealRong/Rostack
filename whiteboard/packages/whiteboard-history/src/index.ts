import { createHistoryBinding } from '@whiteboard/history/binding'
import {
  createLocalEngineHistory,
  DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG
} from '@whiteboard/history/localEngineHistory'

export const history = {
  binding: {
    create: createHistoryBinding
  },
  local: {
    create: createLocalEngineHistory,
    config: {
      default: DEFAULT_LOCAL_ENGINE_HISTORY_CONFIG
    }
  }
} as const

export type {
  HistoryApi,
  HistoryBinding,
  HistoryState,
  LocalEngineHistoryConfig
} from '@whiteboard/history/types'
