import type {
  Engine
} from '@dataview/engine'
import type {
  LocalHistoryBinding
} from '@shared/mutation'
import type {
  CreateRecordApi
} from '@dataview/runtime/workflow/createRecord'
import type {
  InlineSessionApi
} from '@dataview/runtime/session/inline'
import type {
  DataViewModel
} from '@dataview/runtime/model'
import type {
  MarqueeController
} from '@dataview/runtime/session/marquee'
import type {
  PageSessionController,
  PageSessionInput
} from '@dataview/runtime/session/page'
import type {
  ItemSelectionController
} from '@dataview/runtime/selection'
import type {
  ValueEditorController
} from '@dataview/runtime/session/valueEditor'
import type {
  EngineSource
} from '@dataview/runtime/source'

export interface DataViewWorkflow {
  createRecord: CreateRecordApi
}

export interface DataViewSessionApi {
  page: PageSessionController
  selection: ItemSelectionController
  inline: InlineSessionApi
  valueEditor: ValueEditorController
  marquee: MarqueeController
}

export interface CreateDataViewRuntimeInput {
  engine: Engine
  page?: PageSessionInput
}

export interface DataViewRuntime {
  engine: Engine
  history: LocalHistoryBinding<ReturnType<Engine['apply']>>
  source: EngineSource
  session: DataViewSessionApi
  workflow: DataViewWorkflow
  model: DataViewModel
  dispose(): void
}
