import type { Engine } from '@dataview/engine'
import type { ReadStore } from '@shared/core'
import type { ReactNode } from 'react'
import type {
  PageState,
  PageSessionApi,
  PageSessionInput
} from '#react/page/session/types.ts'
import type { SelectionApi } from '#react/runtime/selection/index.ts'
import type { InlineSessionApi } from '#react/runtime/inlineSession/index.ts'
import type { ValueEditorController } from '#react/runtime/valueEditor/index.ts'
import type { MarqueeApi } from '#react/runtime/marquee/index.ts'

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
