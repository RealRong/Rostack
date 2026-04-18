import type {
  DataDoc,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  Engine,
  ItemList,
  ViewState
} from '@dataview/engine'
import type {
  ReadStore
} from '@shared/core'
import type {
  CreateRecordApi
} from '@dataview/runtime/createRecord'
import type {
  InlineSessionApi,
  InlineSessionTarget
} from '@dataview/runtime/inlineSession'
import type {
  PageLock,
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
  ValueEditorSession
} from '@dataview/runtime/valueEditor'

export interface DataViewReadApi {
  engine: Engine
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
  activeView: ReadStore<View | undefined>
  activeItems: ReadStore<ItemList | undefined>
  activeViewState: ReadStore<ViewState | undefined>
}

export interface DataViewWriteApi {
  engine: Engine
  active: Engine['active']
  records: Engine['records']
  views: Engine['views']
}

export interface DataViewSessionState {
  page: PageState
  editing: {
    inline: InlineSessionTarget | null
    valueEditor: ValueEditorSession | null
  }
  selection: ItemSelectionSnapshot
}

export interface DataViewSessionSelectors {
  isValueEditorOpen(): boolean
  pageLock(): PageLock
  activeInlineTarget(): InlineSessionTarget | null
  canStartMarquee(): boolean
}

export interface DataViewSessionApi {
  store: ReadStore<DataViewSessionState>
  page: PageSessionApi & {
    store: ReadStore<PageState>
  }
  selection: ItemSelectionController
  editing: {
    inline: InlineSessionApi
    valueEditor: ValueEditorController
  }
  creation: CreateRecordApi
  select: DataViewSessionSelectors
}

export interface DataViewIntentApi {
  page: PageSessionApi
  selection: ItemSelectionController['command']
  editing: {
    inline: InlineSessionApi
    valueEditor: ValueEditorController
  }
  createRecord: CreateRecordApi
}

export interface CreateDataViewRuntimeInput {
  engine: Engine
  initialPage?: PageSessionInput
}

export interface DataViewRuntime {
  engine: Engine
  read: DataViewReadApi
  write: DataViewWriteApi
  session: DataViewSessionApi
  intent: DataViewIntentApi
  page: DataViewSessionApi['page']
  selection: ItemSelectionController
  inlineSession: InlineSessionApi
  createRecord: CreateRecordApi
  valueEditor: ValueEditorController
  dispose(): void
}
