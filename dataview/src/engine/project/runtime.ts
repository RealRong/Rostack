import type {
  BucketSort,
  DataDoc,
  ViewId
} from '@dataview/core/contracts'
import type {
  CalculationCollection
} from '@dataview/core/calculation'
import {
  resolveViewFilterProjection,
  sameFilterRule,
  type FilterConditionProjection,
  type FilterRuleProjection,
  type ViewFilterProjection
} from '@dataview/core/filter'
import {
  resolveViewGroupProjection,
  type ViewGroupProjection
} from '@dataview/core/group'
import {
  resolveViewSearchProjection,
  type ViewSearchProjection
} from '@dataview/core/search'
import {
  resolveViewSortProjection,
  type SortRuleProjection,
  type ViewSortProjection
} from '@dataview/core/sort'
import {
  resolveViewRecordState
} from '@dataview/core/view'
import {
  getDocumentFields
} from '@dataview/core/document'
import {
  createDerivedStore,
  type ReadStore
} from '@shared/store'
import type {
  ActiveView,
  EngineProjectApi,
  RecordSet
} from '../types'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionKey
} from './types'
import {
  createAppearances
} from './appearances'
import {
  createCalculationsBySection
} from './calculations'
import {
  sameAppearanceList,
  sameCalculationsBySection,
  sameFieldList,
  sameSections
} from './equality'
import {
  createFields
} from './fields'
import {
  createRecordSet
} from './records'
import {
  buildSectionProjection,
  createSections
} from './sections'
import {
  resolveActiveView
} from './view'

const equalList = <T,>(
  left: readonly T[],
  right: readonly T[],
  equal: (left: T, right: T) => boolean
) => (
  left.length === right.length
  && left.every((value, index) => equal(value, right[index] as T))
)

const equalOptionalList = <T,>(
  left: readonly T[] | undefined,
  right: readonly T[] | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!left || !right) {
    return left === right
  }

  return equalList(left, right, equal)
}

const equalProjection = <T,>(
  left: T | undefined,
  right: T | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!left || !right) {
    return left === right
  }

  return equal(left, right)
}

const equalActiveView = (
  left: ActiveView | undefined,
  right: ActiveView | undefined
) => equalProjection(left, right, (current, next) => (
  current.id === next.id
  && current.name === next.name
  && current.type === next.type
))

const equalFilterCondition = (
  left: FilterConditionProjection,
  right: FilterConditionProjection
) => (
  left.id === right.id
  && left.selected === right.selected
)

const equalFilterRuleProjection = (
  left: FilterRuleProjection,
  right: FilterRuleProjection
) => (
  sameFilterRule(left.rule, right.rule)
  && left.fieldId === right.fieldId
  && left.fieldLabel === right.fieldLabel
  && left.activePresetId === right.activePresetId
  && left.effective === right.effective
  && left.editorKind === right.editorKind
  && left.valueText === right.valueText
  && left.bodyLayout === right.bodyLayout
  && equalList(left.conditions, right.conditions, equalFilterCondition)
)

const equalFilterProjection = (
  left: ViewFilterProjection | undefined,
  right: ViewFilterProjection | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.mode === next.mode
  && equalList(current.rules, next.rules, equalFilterRuleProjection)
))

const equalSearchProjection = (
  left: ViewSearchProjection | undefined,
  right: ViewSearchProjection | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.query === next.query
  && current.active === next.active
  && equalOptionalList(current.fields, next.fields, Object.is)
))

const equalSortRuleProjection = (
  left: SortRuleProjection,
  right: SortRuleProjection
) => (
  left.fieldId === right.fieldId
  && left.fieldLabel === right.fieldLabel
  && left.sorter.field === right.sorter.field
  && left.sorter.direction === right.sorter.direction
)

const equalSortProjection = (
  left: ViewSortProjection | undefined,
  right: ViewSortProjection | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.active === next.active
  && equalList(current.rules, next.rules, equalSortRuleProjection)
))

const equalBucketSorts = (
  left: readonly BucketSort[],
  right: readonly BucketSort[]
) => equalList(left, right, Object.is)

const equalGroupProjection = (
  left: ViewGroupProjection | undefined,
  right: ViewGroupProjection | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && current.active === next.active
  && current.fieldId === next.fieldId
  && current.fieldLabel === next.fieldLabel
  && current.mode === next.mode
  && current.bucketSort === next.bucketSort
  && current.bucketInterval === next.bucketInterval
  && current.showEmpty === next.showEmpty
  && current.supportsInterval === next.supportsInterval
  && equalList(current.availableModes, next.availableModes, Object.is)
  && equalBucketSorts(current.availableBucketSorts, next.availableBucketSorts)
))

interface ProjectSnapshot {
  view: ActiveView | undefined
  filter: ViewFilterProjection | undefined
  group: ViewGroupProjection | undefined
  search: ViewSearchProjection | undefined
  sort: ViewSortProjection | undefined
  records: RecordSet | undefined
  sections: readonly Section[] | undefined
  appearances: AppearanceList | undefined
  fields: FieldList | undefined
  calculations: ReadonlyMap<SectionKey, CalculationCollection> | undefined
}

const equalIds = (
  left: readonly string[],
  right: readonly string[]
) => equalList(left, right, Object.is)

const equalOptionalProjection = <T,>(
  left: T | undefined,
  right: T | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!left || !right) {
    return left === right
  }

  return equal(left, right)
}

const equalRecordSet = (
  left: RecordSet | undefined,
  right: RecordSet | undefined
) => equalOptionalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && equalIds(current.derivedIds, next.derivedIds)
  && equalIds(current.orderedIds, next.orderedIds)
  && equalIds(current.visibleIds, next.visibleIds)
))

const equalProjectSnapshot = (
  left: ProjectSnapshot,
  right: ProjectSnapshot
) => (
  equalActiveView(left.view, right.view)
  && equalFilterProjection(left.filter, right.filter)
  && equalGroupProjection(left.group, right.group)
  && equalSearchProjection(left.search, right.search)
  && equalSortProjection(left.sort, right.sort)
  && equalRecordSet(left.records, right.records)
  && equalOptionalProjection(left.sections, right.sections, sameSections)
  && equalOptionalProjection(left.appearances, right.appearances, sameAppearanceList)
  && equalOptionalProjection(left.fields, right.fields, sameFieldList)
  && equalOptionalProjection(left.calculations, right.calculations, sameCalculationsBySection)
)

const emptySnapshot = (): ProjectSnapshot => ({
  view: undefined,
  filter: undefined,
  group: undefined,
  search: undefined,
  sort: undefined,
  records: undefined,
  sections: undefined,
  appearances: undefined,
  fields: undefined,
  calculations: undefined
})

const resolveProjectSnapshot = (input: {
  document: DataDoc
  activeViewId: ViewId | undefined
}): ProjectSnapshot => {
  const {
    document,
    activeViewId
  } = input

  if (!activeViewId) {
    return emptySnapshot()
  }

  const recordState = resolveViewRecordState(document, activeViewId)
  const view = recordState.view
  if (!view) {
    return emptySnapshot()
  }

  const fieldMap = new Map(
    getDocumentFields(document).map(field => [field.id, field] as const)
  )
  const sectionProjection = buildSectionProjection({
    document,
    view,
    visibleRecords: recordState.visibleRecords
  })
  const sections = createSections(
    sectionProjection.sections,
    view.group
  )
  const appearances = createAppearances({
    byId: sectionProjection.appearances,
    sections
  })
  const rowsById = new Map(
    recordState.visibleRecords.map(record => [record.id, record] as const)
  )

  return {
    view: resolveActiveView(document, activeViewId),
    filter: resolveViewFilterProjection(document, activeViewId),
    group: resolveViewGroupProjection(document, activeViewId),
    search: resolveViewSearchProjection(document, activeViewId),
    sort: resolveViewSortProjection(document, activeViewId),
    records: createRecordSet(activeViewId, recordState),
    sections,
    appearances,
    fields: createFields({
      fieldIds: view.display.fields,
      byId: fieldMap
    }),
    calculations: createCalculationsBySection({
      view,
      fieldsById: fieldMap,
      sections,
      appearances: sectionProjection.appearances,
      rowsById
    })
  }
}

const createProjectionStore = <T,>(
  snapshot: ReadStore<ProjectSnapshot>,
  select: (snapshot: ProjectSnapshot) => T,
  isEqual: (left: T, right: T) => boolean
): ReadStore<T> => createDerivedStore<T>({
  get: read => select(read(snapshot)),
  isEqual
})

export const createProjectRuntime = (options: {
  document: ReadStore<DataDoc>
  activeViewId: ReadStore<ViewId | undefined>
}): EngineProjectApi => {
  const snapshot = createDerivedStore<ProjectSnapshot>({
    get: read => resolveProjectSnapshot({
      document: read(options.document),
      activeViewId: read(options.activeViewId)
    }),
    isEqual: equalProjectSnapshot
  })

  return {
    view: createProjectionStore(snapshot, current => current.view, equalActiveView),
    filter: createProjectionStore(snapshot, current => current.filter, equalFilterProjection),
    group: createProjectionStore(snapshot, current => current.group, equalGroupProjection),
    search: createProjectionStore(snapshot, current => current.search, equalSearchProjection),
    sort: createProjectionStore(snapshot, current => current.sort, equalSortProjection),
    records: createProjectionStore(snapshot, current => current.records, equalRecordSet),
    sections: createProjectionStore(snapshot, current => current.sections, (left, right) => equalOptionalProjection(left, right, sameSections)),
    appearances: createProjectionStore(snapshot, current => current.appearances, (left, right) => equalOptionalProjection(left, right, sameAppearanceList)),
    fields: createProjectionStore(snapshot, current => current.fields, (left, right) => equalOptionalProjection(left, right, sameFieldList)),
    calculations: createProjectionStore(snapshot, current => current.calculations, (left, right) => equalOptionalProjection(left, right, sameCalculationsBySection))
  }
}
