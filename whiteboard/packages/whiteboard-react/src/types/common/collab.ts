import type {
  CollabBootstrapMode,
  CollabProvider,
  CollabSession,
  CollabStatus
} from '@whiteboard/collab'
import type * as Y from 'yjs'
import type { WhiteboardPresenceBinding } from '#whiteboard-react/types/common/presence'

export type WhiteboardCollabPresenceOptions = {
  binding: WhiteboardPresenceBinding
}

export type WhiteboardCollabOptions = {
  doc: Y.Doc
  provider?: CollabProvider
  bootstrap?: CollabBootstrapMode
  autoConnect?: boolean
  presence?: WhiteboardCollabPresenceOptions
  onSession?: (session: CollabSession | null) => void
  onStatusChange?: (status: CollabStatus) => void
}
