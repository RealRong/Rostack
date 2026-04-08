import type { ReadStore } from '@shared/store'
import type { EngineInstance } from '@whiteboard/engine'
import type * as Y from 'yjs'
import type {
  CollabBootstrapMode,
  CollabProvider,
  CollabStatus
} from './provider'

export type CreateYjsSessionOptions = {
  engine: EngineInstance
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
