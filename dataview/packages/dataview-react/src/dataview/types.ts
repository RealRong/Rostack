import type {
  ReactNode
} from 'react'
import type {
  CollabProvider,
  CollabSession,
  CollabStatus
} from '@dataview/collab'
import type * as Y from 'yjs'
import type {
  DataViewRuntime
} from '@dataview/runtime'
import type {
  PageSessionInput
} from '@dataview/runtime'
import type {
  DragApi
} from '@dataview/react/page/drag'
import type {
  MarqueeBridgeApi
} from '@dataview/react/page/marqueeBridge'

export interface DataViewReactContextValue extends DataViewRuntime {
  react: {
    drag: DragApi
    marquee: MarqueeBridgeApi
  }
}

export interface DataViewReactSession extends DataViewReactContextValue {
  dispose(): void
}

export interface DataViewCollabOptions {
  doc: Y.Doc
  actorId: string
  provider?: CollabProvider
  autoConnect?: boolean
  onSession?(session: CollabSession | null): void
  onStatusChange?(status: CollabStatus): void
}

export interface DataViewProviderProps {
  engine: DataViewRuntime['engine']
  page?: PageSessionInput
  collab?: DataViewCollabOptions
  children?: ReactNode
}
