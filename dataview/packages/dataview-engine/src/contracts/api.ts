import type {
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  DataRecord,
  FieldId,
  FieldOption,
  RecordFieldWriteManyInput,
  RecordId,
  StatusCategory,
  View,
  ViewId,
  ViewType
} from '@dataview/core/contracts'
import type {
  DocumentOperation
} from '@dataview/core/contracts/operations'
import type {
  HistoryController,
  MutationOptions,
  MutationResult
} from '@shared/mutation'
import type {
  ActiveViewApi
} from '@dataview/engine/contracts/view'
import type {
  DataviewDelta
} from '@dataview/engine/contracts/delta'
import type {
  DataviewHistory,
  DataviewHistoryConfig
} from '@dataview/engine/contracts/history'
import type {
  DataviewCurrent
} from '@dataview/engine/contracts/result'
import type {
  PerformanceApi,
  PerformanceOptions
} from '@dataview/engine/contracts/performance'
import type {
  EngineCommits,
  EngineWrite,
  EngineWrites
} from '@dataview/engine/contracts/write'
import type {
  DataviewMutationKey
} from '@dataview/core/mutation'
import type {
  DataviewErrorCode,
  ExecuteInput,
  ExecuteResult,
  ExecuteResultOf,
  Intent,
  IntentData,
  IntentKind
} from '@dataview/engine/types/intent'

export type { RecordFieldWriteManyInput } from '@dataview/core/contracts'
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

export interface CreateEngineOptions {
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

export interface EngineFacadeHost {
  current(): DataviewCurrent
  doc(): DataDoc
  replace(document: DataDoc, options?: MutationOptions): boolean
  load(document: DataDoc): void
  subscribe(listener: (current: DataviewCurrent) => void): () => void
  execute<I extends ExecuteInput>(
    input: I,
    options?: MutationOptions
  ): ExecuteResultOf<I>
  apply(
    operations: readonly DocumentOperation[],
    options?: MutationOptions
  ): MutationResult<void, EngineWrite, DataviewErrorCode>
}

export interface EngineMutationPort {
  readonly commits: EngineCommits
  readonly history: DataviewHistory
  doc(): DataDoc
  replace(document: DataDoc, options?: MutationOptions): boolean
  apply(
    operations: readonly DocumentOperation[],
    options?: MutationOptions
  ): MutationResult<void, EngineWrite, DataviewErrorCode>
  historyController(): HistoryController<
    DocumentOperation,
    DataviewMutationKey,
    EngineWrite
  > | undefined
  syncHistory(): void
}

export interface Engine {
  readonly commits: EngineCommits
  readonly writes: EngineWrites
  readonly history: DataviewHistory
  readonly mutation: EngineMutationPort
  readonly active: ActiveViewApi
  readonly views: ViewsApi
  readonly fields: FieldsApi
  readonly records: RecordsApi
  readonly performance: PerformanceApi

  current(): DataviewCurrent
  subscribe(listener: (current: DataviewCurrent) => void): () => void

  doc(): DataDoc
  replace(document: DataDoc, options?: MutationOptions): boolean
  load(document: DataDoc): void

  execute<I extends ExecuteInput>(
    input: I,
    options?: MutationOptions
  ): ExecuteResultOf<I>

  apply(
    operations: readonly DocumentOperation[],
    options?: MutationOptions
  ): MutationResult<void, EngineWrite, DataviewErrorCode>
}
