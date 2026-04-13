import type { Engine } from '@dataview/engine'
import type { ReadStore } from '@shared/core'
import type { ReactNode } from 'react'
import type {
  PageState,
  PageSessionApi,
  PageSessionInput
} from '#react/page/session/types'
import type { SelectionApi } from '#react/runtime/selection'
import type { InlineSessionApi } from '#react/runtime/inlineSession'
import type { ValueEditorController } from '#react/runtime/valueEditor'
import type { MarqueeApi } from '#react/runtime/marquee'

export interface DataViewContextValue {
  engine: Engine
  page: PageSessionApi & {
    store: ReadStore<PageState>
  }
  selection: SelectionApi
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
