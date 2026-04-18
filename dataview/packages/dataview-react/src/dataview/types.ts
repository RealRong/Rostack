import type {
  ReactNode
} from 'react'
import type {
  DataViewRuntime,
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

export interface EngineProviderProps {
  engine: DataViewRuntime['engine']
  initialPage?: PageSessionInput
  children?: ReactNode
}
