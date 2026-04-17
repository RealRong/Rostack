import type { Engine } from '@dataview/engine'
import type { ReadStore } from '@shared/core'
import type { ReactNode } from 'react'
import type {
  PageState,
  PageSessionApi,
  PageSessionInput
} from '@dataview/react/page/session/types'
import type { DragApi } from '@dataview/react/page/drag'
import type { ItemSelectionController } from '@dataview/react/runtime/selection'
import type { InlineSessionApi } from '@dataview/react/runtime/inlineSession'
import type { ValueEditorController } from '@dataview/react/runtime/valueEditor'
import type { MarqueeApi } from '@dataview/react/runtime/marquee'

export interface DataViewContextValue {
  engine: Engine
  page: PageSessionApi & {
    store: ReadStore<PageState>
    drag: DragApi
  }
  selection: ItemSelectionController
  marquee: MarqueeApi
  inlineSession: InlineSessionApi
  valueEditor: ValueEditorController
}

export interface DataViewSession extends DataViewContextValue {
  dispose(): void
}

export interface EngineProviderProps {
  engine: Engine
  initialPage?: PageSessionInput
  children?: ReactNode
}
