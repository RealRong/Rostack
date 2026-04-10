import type {
  CalculationCollection
} from '@dataview/core/calculation'
import type {
  BucketSort,
  DataDoc,
  View,
  ViewId
} from '@dataview/core/contracts'
import type {
  FilterConditionProjection,
  FilterRuleProjection,
  ViewFilterProjection
} from '@dataview/core/filter'
import {
  sameFilterRule
} from '@dataview/core/filter'
import type {
  ViewGroupProjection
} from '@dataview/core/group'
import type {
  ViewSearchProjection
} from '@dataview/core/search'
import type {
  SortRuleProjection,
  ViewSortProjection
} from '@dataview/core/sort'
import {
  buildPublishedViewState,
  resolveFieldsById
} from '../publish'
import type {
  AppearanceList,
  Section,
  SectionKey
} from '../types'
import type {
  ActiveView,
  RecordSet
} from '../../types'
import type {
  IndexState
} from '../../index/types'
import type {
  CalcState,
  ProjectState,
  ProjectionState
} from './state'
import {
  sameFieldList
} from './equality'
import {
  toPublishedCalculations
} from './calc'

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

export const createRecordSet = (
  activeViewId: ViewId,
  projection: ProjectionState['query'],
  previous?: RecordSet
): RecordSet => previous
  && previous.viewId === activeViewId
  && previous.derivedIds === projection.derived
  && previous.orderedIds === projection.ordered
  && previous.visibleIds === projection.visible
  ? previous
  : {
      viewId: activeViewId,
      derivedIds: projection.derived,
      orderedIds: projection.ordered,
      visibleIds: projection.visible
    }

const reuseProjection = <T,>(
  previous: T | undefined,
  next: T | undefined,
  equal: (left: T, right: T) => boolean
) => {
  if (!previous || !next) {
    return next
  }

  return equal(previous, next)
    ? previous
    : next
}

export const buildPublishedProjectState = (input: {
  document: DataDoc
  view?: View
  activeViewId?: ViewId
  query: ProjectionState['query']
  calc: CalcState
  nav?: ProjectionState['nav']
  index: IndexState
  previousProjection: ProjectionState
  previousPublished: ProjectState
}): ProjectState => {
  const rawThin = buildPublishedViewState({
    document: input.document,
    viewId: input.activeViewId
  })
  const thin = {
    view: reuseProjection(input.previousPublished.view, rawThin.view, equalActiveView),
    filter: reuseProjection(input.previousPublished.filter, rawThin.filter, equalFilterProjection),
    group: reuseProjection(input.previousPublished.group, rawThin.group, equalGroupProjection),
    search: reuseProjection(input.previousPublished.search, rawThin.search, equalSearchProjection),
    sort: reuseProjection(input.previousPublished.sort, rawThin.sort, equalSortProjection),
    fields: reuseProjection(input.previousPublished.fields, rawThin.fields, sameFieldList)
  }

  const records = input.view && input.activeViewId
    ? createRecordSet(input.activeViewId, input.query, input.previousPublished.records)
    : undefined
  const appearances = input.nav?.appearances
  const sections = input.nav?.sections
  const calculations = input.view
    ? toPublishedCalculations({
        calc: input.calc,
        previousCalc: input.previousProjection.calc,
        previous: input.previousPublished.calculations,
        fieldsById: resolveFieldsById(input.document),
        view: input.view
      })
    : undefined

  return {
    view: thin.view,
    filter: thin.filter,
    group: thin.group,
    search: thin.search,
    sort: thin.sort,
    records,
    sections,
    appearances,
    fields: thin.fields,
    calculations
  }
}
