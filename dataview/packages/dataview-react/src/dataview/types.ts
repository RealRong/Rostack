import type {
  ReactNode
} from 'react'
import type {
  CollabProvider,
  CollabStatus,
  MutationCollabSession
} from '@shared/collab'
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
import type {
  EngineApplyCommit
} from '@dataview/engine/contracts/write'

export type DataViewCollabSession = MutationCollabSession<EngineApplyCommit>

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
  onSession?(session: DataViewCollabSession | null): void
  onStatusChange?(status: CollabStatus): void
}

export interface DataViewProviderProps {
  engine: DataViewRuntime['engine']
  page?: PageSessionInput
  collab?: DataViewCollabOptions
  children?: ReactNode
}
