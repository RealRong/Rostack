import { createYjsSession } from '@dataview/collab/session'
import { createYjsSyncCodec } from '@dataview/collab/yjs/codec'
import { createYjsSyncStore } from '@shared/collab-yjs'

export const collab = {
  yjs: {
    session: {
      create: createYjsSession
    },
    codec: {
      create: createYjsSyncCodec
    },
    store: {
      create: createYjsSyncStore
    }
  }
} as const

export type {
  CollabDiagnostics,
  CollabLocalHistory,
  CollabProvider,
  CollabSession,
  CollabStatus,
  CreateYjsSessionOptions,
  SharedChange,
  SharedCheckpoint,
  SharedMeta,
  YjsSyncCodec,
  YjsSyncStore
} from '@dataview/collab/types'
