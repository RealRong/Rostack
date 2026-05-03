import type {
  CollabProvider,
  CollabStatus,
  MutationCollabSession
} from '@shared/collab'
import type * as Y from 'yjs'
import type { WhiteboardPresenceBinding } from '@whiteboard/react/types/common/presence'
import type { IntentResult } from '@whiteboard/engine'

export type WhiteboardCollabSession = MutationCollabSession<IntentResult>

export type WhiteboardCollabPresenceOptions = {
  binding: WhiteboardPresenceBinding
}

export type WhiteboardCollabOptions = {
  doc: Y.Doc
  actorId: string
  provider?: CollabProvider
  autoConnect?: boolean
  presence?: WhiteboardCollabPresenceOptions
  onSession?: (session: WhiteboardCollabSession | null) => void
  onStatusChange?: (status: CollabStatus) => void
}
