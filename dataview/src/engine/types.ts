import type {
  GroupBucketSort,
  GroupCommand,
  GroupCommitChangeSet,
  GroupDocument,
  GroupEditTarget,
  GroupFilterRule,
  GroupGalleryCardSize,
  GroupGroupBy,
  GroupProperty,
  GroupPropertyConfig,
  GroupPropertyKind,
  GroupPropertyOption,
  GroupKanbanNewRecordPosition,
  GroupStatusCategory,
  GroupRecord,
  GroupSortDirection,
  GroupSorter,
  GroupValueApplyAction,
  GroupView,
  GroupViewType,
  RecordId,
  ViewId,
  PropertyId
} from '@dataview/core/contracts'
import type { GroupHistoryOptions, GroupHistoryState } from './history'
import type { GroupValidationIssue } from '@dataview/engine/command'
import type { KeyedReadStore, ReadStore } from '@dataview/runtime/store'
import type { ViewProjection } from '@dataview/engine/projection/view'

export interface CreateGroupEngineOptions {
  document: GroupDocument
  history?: GroupHistoryOptions
}

export interface GroupCommitResult {
  issues: GroupValidationIssue[]
  applied: boolean
  changes?: GroupCommitChangeSet
}

export interface GroupCreatedEntities {
  records?: readonly RecordId[]
  properties?: readonly PropertyId[]
  views?: readonly ViewId[]
}

export interface GroupCommandResult extends GroupCommitResult {
  created?: GroupCreatedEntities
}
export interface GroupHistoryActionResult extends GroupCommitResult {}

export interface GroupEngineReadApi {
  document: ReadStore<GroupDocument>
  recordIds: ReadStore<readonly RecordId[]>
  record: KeyedReadStore<RecordId, GroupRecord | undefined>
  propertyIds: ReadStore<readonly PropertyId[]>
  property: KeyedReadStore<PropertyId, GroupProperty | undefined>
  viewIds: ReadStore<readonly ViewId[]>
  view: KeyedReadStore<ViewId, GroupView | undefined>
  viewProjection: KeyedReadStore<ViewId, ViewProjection | undefined>
}

export interface GroupEngineHistoryApi {
  state: () => GroupHistoryState
  canUndo: () => boolean
  canRedo: () => boolean
  undo: () => GroupHistoryActionResult
  redo: () => GroupHistoryActionResult
  clear: () => void
}

export interface GroupEngineDocumentApi {
  export: () => GroupDocument
  replace: (document: GroupDocument) => GroupDocument
}

export interface GroupViewsEngineApi {
  list: () => readonly GroupView[]
  get: (viewId: ViewId) => GroupView | undefined
  create: (input: {
    name: string
    type: GroupViewType
  }) => ViewId | undefined
  rename: (viewId: ViewId, name: string) => void
  duplicate: (viewId: ViewId) => ViewId | undefined
  remove: (viewId: ViewId) => void
}

export interface GroupPropertiesEngineApi {
  list: () => readonly GroupProperty[]
  get: (propertyId: PropertyId) => GroupProperty | undefined
  create: (input: {
    name: string
    kind?: GroupPropertyKind
  }) => PropertyId | undefined
  rename: (propertyId: PropertyId, name: string) => void
  update: (propertyId: PropertyId, patch: Partial<Omit<GroupProperty, 'id'>>) => void
  convert: (
    propertyId: PropertyId,
    input: {
      kind: GroupPropertyKind
      config?: GroupPropertyConfig
    }
  ) => void
  duplicate: (propertyId: PropertyId) => PropertyId | undefined
  remove: (propertyId: PropertyId) => boolean
  options: {
    append: (propertyId: PropertyId) => GroupPropertyOption | undefined
    create: (propertyId: PropertyId, name: string) => GroupPropertyOption | undefined
    reorder: (
      propertyId: PropertyId,
      optionIds: readonly string[]
    ) => void
    update: (
      propertyId: PropertyId,
      optionId: string,
      patch: {
        name?: string
        color?: string
        category?: GroupStatusCategory
      }
    ) => GroupPropertyOption | undefined
    remove: (propertyId: PropertyId, optionId: string) => void
  }
}

export interface GroupRecordsEngineApi {
  get: (recordId: RecordId) => GroupRecord | undefined
  create: (input?: {
    values?: Partial<Record<PropertyId, unknown>>
  }) => RecordId | undefined
  remove: (recordId: RecordId) => void
  removeMany: (recordIds: readonly RecordId[]) => void
  setValue: (recordId: RecordId, propertyId: PropertyId, value: unknown) => void
  clearValue: (recordId: RecordId, propertyId: PropertyId) => void
  clearValues: (input: {
    recordIds: readonly RecordId[]
    propertyIds: readonly PropertyId[]
  }) => void
  apply: (command: {
    target: GroupEditTarget
    action: GroupValueApplyAction
  }) => void
}

export interface GroupViewQueryApi {
  setSearchQuery: (value: string) => void
  addFilter: (propertyId: PropertyId) => void
  setFilter: (index: number, rule: GroupFilterRule) => void
  removeFilter: (index: number) => void
  addSorter: (propertyId: PropertyId, direction?: GroupSortDirection) => void
  setSorter: (propertyId: PropertyId, direction: GroupSortDirection) => void
  setOnlySorter: (propertyId: PropertyId, direction: GroupSortDirection) => void
  replaceSorter: (index: number, sorter: GroupSorter) => void
  removeSorter: (index: number) => void
  moveSorter: (from: number, to: number) => void
  clearSorters: () => void
  setGroup: (propertyId: PropertyId) => void
  clearGroup: () => void
  toggleGroup: (propertyId: PropertyId) => void
  setGroupMode: (mode: string) => void
  setGroupBucketSort: (bucketSort: GroupBucketSort) => void
  setGroupBucketInterval: (bucketInterval: GroupGroupBy['bucketInterval']) => void
  setGroupShowEmpty: (showEmpty: boolean) => void
  setGroupBucketHidden: (key: string, hidden: boolean) => void
  setGroupBucketCollapsed: (key: string, collapsed: boolean) => void
  toggleGroupBucketCollapsed: (key: string) => void
}

export interface GroupViewDisplaySettingsApi {
  setPropertyIds: (propertyIds: readonly PropertyId[]) => void
  movePropertyIds: (
    propertyIds: readonly PropertyId[],
    beforePropertyId?: PropertyId | null
  ) => void
  showProperty: (
    propertyId: PropertyId,
    beforePropertyId?: PropertyId | null
  ) => void
  hideProperty: (propertyId: PropertyId) => void
}

export interface GroupViewTableSettingsApi {
  setColumnWidths: (widths: Partial<Record<PropertyId, number>>) => void
}

export interface GroupViewGallerySettingsApi {
  setShowPropertyLabels: (checked: boolean) => void
  setCardSize: (value: GroupGalleryCardSize) => void
}

export interface GroupViewKanbanSettingsApi {
  setNewRecordPosition: (value: GroupKanbanNewRecordPosition) => void
}

export interface GroupViewSettingsApi {
  display: GroupViewDisplaySettingsApi
  table: GroupViewTableSettingsApi
  gallery: GroupViewGallerySettingsApi
  kanban: GroupViewKanbanSettingsApi
}

export interface GroupViewOrderApi {
  move: (recordIds: readonly RecordId[], beforeRecordId?: RecordId) => void
  clear: () => void
}

export interface GroupKanbanCreateCardInput {
  groupKey: string
  title: string
}

export interface GroupKanbanMoveCardsInput {
  recordIds: readonly RecordId[]
  groupKey: string
  beforeRecordId?: RecordId
}

export interface GroupKanbanApi {
  createCard: (input: GroupKanbanCreateCardInput) => RecordId | undefined
  moveCards: (input: GroupKanbanMoveCardsInput) => void
}

export interface GroupViewEngineApi {
  setType: (type: GroupViewType) => void
  search: {
    setQuery: (value: string) => void
  }
  filters: {
    add: (propertyId: PropertyId) => void
    update: (index: number, rule: GroupFilterRule) => void
    remove: (index: number) => void
    clear: () => void
  }
  sorters: {
    add: (propertyId: PropertyId, direction?: GroupSortDirection) => void
    move: (from: number, to: number) => void
    replace: (index: number, sorter: GroupSorter) => void
    remove: (index: number) => void
    clear: () => void
    setOnly: (propertyId: PropertyId, direction: GroupSortDirection) => void
  }
  grouping: {
    setProperty: (propertyId: PropertyId) => void
    clear: () => void
    setMode: (mode: string) => void
    setBucketSort: (bucketSort: GroupBucketSort) => void
    setBucketInterval: (bucketInterval: GroupGroupBy['bucketInterval']) => void
    setShowEmpty: (showEmpty: boolean) => void
    setBucketHidden: (key: string, hidden: boolean) => void
    setBucketCollapsed: (key: string, collapsed: boolean) => void
    toggleBucketCollapsed: (key: string) => void
  }
  display: {
    setVisibleProperties: (propertyIds: readonly PropertyId[]) => void
    moveVisibleProperties: (
      propertyIds: readonly PropertyId[],
      beforePropertyId?: PropertyId | null
    ) => void
    showProperty: (
      propertyId: PropertyId,
      beforePropertyId?: PropertyId | null
    ) => void
    hideProperty: (propertyId: PropertyId) => void
  }
  table: {
    setColumnWidths: (widths: Partial<Record<PropertyId, number>>) => void
    insertColumnLeftOf: (
      anchorPropertyId: PropertyId,
      input?: {
        name?: string
        kind?: GroupPropertyKind
      }
    ) => PropertyId | undefined
    insertColumnRightOf: (
      anchorPropertyId: PropertyId,
      input?: {
        name?: string
        kind?: GroupPropertyKind
      }
    ) => PropertyId | undefined
  }
  query: GroupViewQueryApi
  settings: GroupViewSettingsApi
  order: GroupViewOrderApi
  kanban: GroupKanbanApi
}

export interface GroupEngine {
  read: GroupEngineReadApi
  command: (command: GroupCommand | readonly GroupCommand[]) => GroupCommandResult
  history: GroupEngineHistoryApi
  document: GroupEngineDocumentApi
  views: GroupViewsEngineApi
  properties: GroupPropertiesEngineApi
  records: GroupRecordsEngineApi
  view: (viewId: ViewId) => GroupViewEngineApi
}
