import type { Action } from '@dataview/core/contracts'
import type { ActionResult } from './command'
import type { EngineDocumentApi, EngineHistoryApi } from './history'
import type { EnginePerfApi } from './perf'
import type { EngineProjectApi, EngineReadApi } from './project'
import type {
  FieldsEngineApi,
  RecordsEngineApi,
  ViewAccessorApi,
  ViewsEngineApi
} from './services'

export interface Engine {
  read: EngineReadApi
  project: EngineProjectApi
  perf: EnginePerfApi
  action: (action: Action | readonly Action[]) => ActionResult
  history: EngineHistoryApi
  document: EngineDocumentApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  view: ViewAccessorApi
}
