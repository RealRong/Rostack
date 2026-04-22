import type { CalculationCollection } from '@dataview/core/calculation'
import type {
  Action,
  CalculationMetric,
  CommitSummary,
  CustomField,
  CustomFieldId,
  CustomFieldKind,
  DataDoc,
  Field,
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
import type {
  ValidationIssue
} from '@dataview/engine/mutate/issues'
import type {
  EngineCore
} from '@dataview/engine/contracts/core'
import type {
  ActiveViewApi,
  ViewState
} from '@dataview/engine/contracts/view'
import type {
  HistoryApi,
  HistoryOptions
} from '@dataview/engine/contracts/history'
import type {
  PerformanceApi,
  PerformanceOptions
} from '@dataview/engine/contracts/performance'

export type { RecordFieldWriteManyInput } from '@dataview/core/contracts'
export type {
  CellRef,
  FieldList,
  ItemId,
  ItemIdPool,
  ItemPlacement,
  ItemList,
  MoveTarget,
  Section,
  SectionBucket,
  SectionKey,
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

export interface CommitResult {
  issues: readonly ValidationIssue[]
  applied: boolean
  summary?: CommitSummary
}

export interface CreatedEntities {
  records?: readonly RecordId[]
  fields?: readonly CustomFieldId[]
  views?: readonly ViewId[]
}

export interface ActionResult extends CommitResult {
  created?: CreatedEntities
}

export interface EngineReadApi {
  document: () => DataDoc
  record: (recordId: RecordId) => DataRecord | undefined
  field: (fieldId: FieldId) => CustomField | undefined
  view: (viewId: ViewId) => View | undefined
  activeViewId: () => ViewId | undefined
  activeView: () => View | undefined
  activeState: () => ViewState | undefined
}

export interface ViewsApi {
  list: () => readonly View[]
  get: (viewId: ViewId) => View | undefined
  open: (viewId: ViewId) => void
  create: (input: {
    name: string
    type: ViewType
  }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}

export interface FieldsApi {
  list: () => readonly CustomField[]
  get: (fieldId: CustomFieldId) => CustomField | undefined
  create: (input: {
    name: string
    kind?: CustomFieldKind
  }) => CustomFieldId | undefined
  rename: (fieldId: CustomFieldId, name: string) => void
  update: (fieldId: CustomFieldId, patch: Partial<Omit<CustomField, 'id'>>) => void
  replace: (fieldId: CustomFieldId, field: CustomField) => void
  changeType: (
    fieldId: CustomFieldId,
    input: {
      kind: CustomFieldKind
    }
  ) => void
  duplicate: (fieldId: CustomFieldId) => CustomFieldId | undefined
  remove: (fieldId: CustomFieldId) => boolean
  options: {
    append: (fieldId: CustomFieldId) => FieldOption | undefined
    create: (fieldId: CustomFieldId, name: string) => FieldOption | undefined
    reorder: (fieldId: CustomFieldId, optionIds: readonly string[]) => void
    update: (
      fieldId: CustomFieldId,
      optionId: string,
      patch: {
        name?: string
        color?: string
        category?: StatusCategory
      }
    ) => FieldOption | undefined
    remove: (fieldId: CustomFieldId, optionId: string) => void
  }
}

export interface RecordsApi {
  get: (recordId: RecordId) => DataRecord | undefined
  create: (input?: {
    values?: Partial<Record<CustomFieldId, unknown>>
  }) => RecordId | undefined
  remove: (recordId: RecordId) => void
  removeMany: (recordIds: readonly RecordId[]) => void
  fields: {
    set: (recordId: RecordId, fieldId: FieldId, value: unknown) => void
    clear: (recordId: RecordId, fieldId: FieldId) => void
    writeMany: (input: RecordFieldWriteManyInput) => void
  }
}

export interface DocumentApi {
  export: () => DataDoc
  replace: (document: DataDoc) => DataDoc
}

export interface Engine {
  core: EngineCore
  read: EngineReadApi
  active: ActiveViewApi
  views: ViewsApi
  fields: FieldsApi
  records: RecordsApi
  document: DocumentApi
  history: HistoryApi
  performance: PerformanceApi
  dispatch: (action: Action | readonly Action[]) => ActionResult
}
