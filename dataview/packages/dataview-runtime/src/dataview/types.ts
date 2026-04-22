import type {
  Engine,
  ItemId
} from '@dataview/engine'
import { store } from '@shared/core'
import type {
  CreateRecordApi
} from '@dataview/runtime/createRecord'
import type {
  InlineSessionApi,
  InlineSessionTarget
} from '@dataview/runtime/inlineSession'
import type {
  DataViewModel
} from '@dataview/runtime/model'
import type {
  MarqueeIntentApi,
  MarqueeSessionApi
} from '@dataview/runtime/marquee'
import type {
  PageState,
  PageSessionApi,
  PageSessionInput
} from '@dataview/runtime/page/session/types'
import type {
  ItemSelectionController,
  ItemSelectionSnapshot
} from '@dataview/runtime/selection'
import type {
  ValueEditorController,
  OpenValueEditorInput
} from '@dataview/runtime/valueEditor'
import type {
  ActiveSource,
  DocumentSource
} from '@dataview/runtime/source'
import type {
  TableRuntime
} from '@dataview/runtime/table'

export type InlineKey = string

export interface SelectionSource {
  member: store.KeyedReadStore<ItemId, boolean>
  preview: store.KeyedReadStore<ItemId, boolean | null>
}

export interface InlineSource {
  editing: store.KeyedReadStore<InlineKey, boolean>
}

export interface DataViewSource {
  doc: DocumentSource
  active: ActiveSource
  selection: SelectionSource
  inline: InlineSource
}

export interface DataViewSessionState {
  page: PageState
  editing: {
    inline: InlineSessionTarget | null
    valueEditor: OpenValueEditorInput | null
  }
  selection: ItemSelectionSnapshot
}

export interface DataViewSessionApi {
  store: store.ReadStore<DataViewSessionState>
  page: PageSessionApi & {
    store: store.ReadStore<PageState>
  }
  selection: ItemSelectionController
  editing: {
    inline: InlineSessionApi
    valueEditor: ValueEditorController
  }
  creation: CreateRecordApi
  marquee: MarqueeSessionApi
}

export interface DataViewIntentApi {
  page: PageSessionApi
  selection: ItemSelectionController['command']
  editing: {
    inline: InlineSessionApi
    valueEditor: ValueEditorController
  }
  createRecord: CreateRecordApi
  marquee: MarqueeIntentApi
}

export interface CreateDataViewRuntimeInput {
  engine: Engine
  initialPage?: PageSessionInput
}

export interface DataViewRuntime {
  engine: Engine
  source: DataViewSource
  table: TableRuntime
  session: DataViewSessionApi
  intent: DataViewIntentApi
  model: DataViewModel
  dispose(): void
}
