import type { ReadStore } from '@shared/core'
import type { Engine } from '@whiteboard/engine'
import type * as Y from 'yjs'
import type {
  CollabBootstrapMode,
  CollabProvider,
  CollabStatus
} from '#whiteboard-collab/types/provider'

export type CreateYjsSessionOptions = {
  engine: Engine
  doc: Y.Doc
  provider?: CollabProvider
  bootstrap?: CollabBootstrapMode
}

export type CollabSession = {
  awareness?: unknown
  status: ReadStore<CollabStatus>
  connect: () => void
  disconnect: () => void
  resync: (mode?: CollabBootstrapMode) => void
  destroy: () => void
}
