import { createYjsSession } from '@whiteboard/collab/session'
import { createYjsSyncCodec } from '@whiteboard/collab/yjs/codec'
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
} from '@whiteboard/collab/types'
