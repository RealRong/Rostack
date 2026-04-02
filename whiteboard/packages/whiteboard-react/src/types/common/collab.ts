import type {
  CollabBootstrapMode,
  CollabProvider,
  CollabSession,
  CollabStatus
} from '@whiteboard/collab'
import type * as Y from 'yjs'

export type WhiteboardCollabOptions = {
  doc: Y.Doc
  provider?: CollabProvider
  bootstrap?: CollabBootstrapMode
  autoConnect?: boolean
  onSession?: (session: CollabSession | null) => void
  onStatusChange?: (status: CollabStatus) => void
}
