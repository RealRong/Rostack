import type {
  Action,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  FieldId,
  FieldOption,
  RecordFieldWriteManyInput,
  RecordId,
  DataRecord,
  StatusCategory,
  View,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type { DocumentOperation } from '@dataview/core/contracts/operations'
import type {
  HistoryApi,
  HistoryOptions
} from '@dataview/engine/contracts/history'
import type {
  PerformanceApi,
  PerformanceOptions
} from '@dataview/engine/contracts/performance'
import type {
  ActionResult,
  CommitResult,
  EngineResult
} from '@dataview/engine/contracts/result'
import type {
  EngineWrites
} from '@dataview/engine/contracts/write'
import type {
  ActiveViewApi
} from '@dataview/engine/contracts/view'
import type { Origin } from '@shared/mutation'

export type { RecordFieldWriteManyInput } from '@dataview/core/contracts'
export type {
  CellRef,
  FieldList,
  ItemId,
  ItemPlacement,
  ItemList,
  MoveTarget,
  Section,
  SectionBucket,
  SectionId,
  SectionList,
  ViewFieldRef,
  ViewRecords,
  ViewSummaries
} from '@dataview/engine/contracts/shared'

export interface CreateEngineOptions {
  document: DataDoc
  history?: HistoryOptions
  performance?: PerformanceOptions
}

export interface ExecuteOptions {
  origin?: Origin
}

export interface ApplyOptions {
  origin?: Origin
}

export interface ViewsApi {
  list: () => readonly View[]
  get: (id: ViewId) => View | undefined
  open: (id: ViewId) => void
  create: (input: {
    name: string
    type: ViewType
  }) => ViewId | undefined
  rename: (id: ViewId, name: string) => void
  duplicate: (id: ViewId) => ViewId | undefined
  remove: (id: ViewId) => void
}

export interface FieldsApi {
  list: () => readonly CustomField[]
  get: (id: CustomFieldId) => CustomField | undefined
  create: (input: {
    name: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  rename: (id: CustomFieldId, name: string) => void
  patch: (id: CustomFieldId, patch: Partial<Omit<CustomField, 'id'>>) => void
  replace: (id: CustomFieldId, field: CustomField) => void
  setKind: (id: CustomFieldId, kind: CustomFieldKind) => void
  duplicate: (id: CustomFieldId) => CustomFieldId | undefined
  remove: (id: CustomFieldId) => boolean
  options: {
    create: (
      id: CustomFieldId,
      input?: {
        name?: string
      }
    ) => FieldOption | undefined
    setOrder: (id: CustomFieldId, order: readonly string[]) => void
    patch: (input: {
      field: CustomFieldId
      option: string
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    }) => FieldOption | undefined
    remove: (input: {
      field: CustomFieldId
      option: string
    }) => void
  }
}

export interface RecordCreateOptions {
  values?: Partial<Record<CustomFieldId, unknown>>
}

export interface RecordFieldWriteApi {
  set: (record: RecordId, field: FieldId, value: unknown) => void
  clear: (record: RecordId, field: FieldId) => void
  writeMany: (input: RecordFieldWriteManyInput) => void
}

export interface RecordsApi {
  get: (id: RecordId) => DataRecord | undefined
  create: (input?: RecordCreateOptions) => RecordId | undefined
  remove: (id: RecordId) => void
  removeMany: (ids: readonly RecordId[]) => void
  fields: RecordFieldWriteApi
}

export interface DocumentApi {
  get: () => DataDoc
  replace: (document: DataDoc) => DataDoc
}

export interface Engine {
  result: () => EngineResult
  subscribe: (listener: (result: EngineResult) => void) => () => void
  readonly writes: EngineWrites
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  execute: (
    action: Action | readonly Action[],
    options?: ExecuteOptions
  ) => ActionResult
  apply: (
    operations: readonly DocumentOperation[],
    options?: ApplyOptions
  ) => CommitResult
}
