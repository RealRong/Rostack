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
  MarqueeApi
} from '@dataview/react/runtime/marquee'

export interface DataViewContextValue extends DataViewRuntime {
  marquee: MarqueeApi
  page: DataViewRuntime['page'] & {
    drag: DragApi
  }
}

export interface DataViewSession extends DataViewContextValue {
  dispose(): void
}

export interface EngineProviderProps {
  engine: DataViewRuntime['engine']
  initialPage?: PageSessionInput
  children?: ReactNode
}
