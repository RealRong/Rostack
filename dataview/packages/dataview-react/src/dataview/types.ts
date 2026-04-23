import type {
  ReactNode
} from 'react'
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

export interface DataViewProviderProps {
  engine: DataViewRuntime['engine']
  page?: PageSessionInput
  children?: ReactNode
}
