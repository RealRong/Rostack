import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  DataRecord,
  DocumentOperation,
  FieldId,
  FieldOption,
  RecordFieldWriteManyInput,
  RecordId,
  StatusCategory,
  View,
  ViewId,
  ViewType
} from '@dataview/core/types'
import type {
  fieldKindSpec
} from '@dataview/core/field/kind/spec'
import type {
  filterSpec
} from '@dataview/core/view/filter/spec'
import type {
  viewTypeSpec
} from '@dataview/core/view/typeSpec'
import type {
  MutationOptions,
  MutationResult
} from '@shared/mutation/engine'
import type {
  MutationProgram
} from '@shared/mutation'
import type {
  MutationReplaceCommit
} from '@shared/mutation/write'
import type {
  ActiveViewApi
} from '@dataview/engine/contracts/view'
import type {
  DataviewHistory,
  DataviewHistoryConfig
} from '@dataview/engine/contracts/history'
import type {
  DataviewCurrent
} from '@dataview/engine/contracts/result'
import type {
  EngineSource
} from '@dataview/engine/contracts/source'
import type {
  PerformanceApi,
  PerformanceOptions
} from '@dataview/engine/contracts/performance'
import type {
  EngineCommits,
  EngineApplyCommit
} from '@dataview/engine/contracts/write'
import type {
  ExecuteInput,
  ExecuteResultOf,
  Intent,
  IntentData,
  IntentKind
} from '@dataview/engine/types/intent'

export type { RecordFieldWriteManyInput } from '@dataview/core/types'
export type {
  DataviewErrorCode,
  ExecuteInput,
  ExecuteResult,
  ExecuteResultOf,
  Intent,
  IntentData,
  IntentKind
} from '@dataview/engine/types/intent'
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

export interface DataviewSpec {
  viewTypes: typeof viewTypeSpec
  fieldKinds: typeof fieldKindSpec
  filters: typeof filterSpec
  fieldValues: Record<string, unknown>
  models: {
    page: Record<string, unknown>
    card: Record<string, unknown>
  }
}

export interface CreateEngineOptions {
  spec: DataviewSpec
  document: DataDoc
  history?: Partial<DataviewHistoryConfig>
  performance?: PerformanceOptions
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
    move: (input: {
      field: CustomFieldId
      option: string
      before?: string
      category?: StatusCategory
    }) => void
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

export interface Engine {
  readonly spec: DataviewSpec
  readonly commits: EngineCommits
  readonly history: DataviewHistory
  readonly source: EngineSource
  readonly active: ActiveViewApi
  readonly views: ViewsApi
  readonly fields: FieldsApi
  readonly records: RecordsApi
  readonly performance: PerformanceApi

  current(): DataviewCurrent
  subscribe(listener: (current: DataviewCurrent) => void): () => void

  doc(): DataDoc
  replace(document: DataDoc, options?: MutationOptions): MutationReplaceCommit<DataDoc>

  execute<I extends ExecuteInput>(
    input: I,
    options?: MutationOptions
  ): ExecuteResultOf<I>

  apply(
    program: MutationProgram<string>,
    options?: MutationOptions
  ): MutationResult<void, EngineApplyCommit>
}
