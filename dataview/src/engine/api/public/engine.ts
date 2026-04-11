import type { EngineDocumentApi, EngineHistoryApi } from './history'
import type { EnginePerfApi } from './perf'
import type { ActiveEngineApi, EngineReadApi } from './project'
import type {
  FieldsEngineApi,
  RecordsEngineApi,
  ViewsEngineApi
} from './services'

export interface Engine {
  active: ActiveEngineApi
  views: ViewsEngineApi
  fields: FieldsEngineApi
  records: RecordsEngineApi
  document: EngineDocumentApi
  history: EngineHistoryApi
  perf: EnginePerfApi
  read: EngineReadApi
}
