import type {
  BucketSort,
  CommitDelta,
  DataDoc,
  Field,
  FieldId,
  RecordId,
  Row,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  createResetDelta
} from '@dataview/core/commit/delta'
import type {
  CalculationCollection
} from '@dataview/core/calculation'
import {
  sameFilterRule,
  type FilterConditionProjection,
  type FilterRuleProjection,
  type ViewFilterProjection
} from '@dataview/core/filter'
import {
  type ViewGroupProjection
} from '@dataview/core/group'
import {
  type ViewSearchProjection
} from '@dataview/core/search'
import {
  type SortRuleProjection,
  type ViewSortProjection
} from '@dataview/core/sort'
import {
  getDocumentFields
} from '@dataview/core/document'
import {
  resolveViewRecordState,
  type ResolvedViewRecordState
} from '@dataview/core/view'
import {
  createValueStore
} from '@shared/store'
import {
  createEngineIndex
} from '../index/runtime'
import type {
  IndexState
} from '../index/types'
import type {
  ActiveView,
  EngineProjectApi,
  RecordSet
} from '../types'
import {
  appearancesStage
} from './appearances'
import {
  calculationsStage
} from './calculations'
import {
  sameAppearanceList,
  sameCalculationsBySection,
  sameFieldList,
  sameSections
} from './equality'
import {
  fieldsStage
} from './fields'
import {
  filterStage
} from './filter'
import {
  groupStage
} from './group'
import {
  recordsStage
} from './records'
import {
  searchStage
} from './search'
import {
  sortStage
} from './sort'
import type {
  StageNext,
  StageRead
} from './stage'
import {
  buildProjectPlan,
  type ProjectPlan
} from './planner'
import {
  buildSectionProjection,
  sectionsStage
} from './sections'
import {
  emptyProjectState,
  type ProjectState
} from './state'
import type {
  Appearance,
  AppearanceId,
  AppearanceList,
  FieldList,
  ProjectionSection,
  Section,
  SectionKey
} from './types'
import { viewStage } from './view'

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

const equalIds = (
  left: readonly string[],
  right: readonly string[]
) => equalList(left, right, Object.is)

const equalRecordSet = (
  left: RecordSet | undefined,
  right: RecordSet | undefined
) => equalProjection(left, right, (current, next) => (
  current.viewId === next.viewId
  && equalIds(current.derivedIds, next.derivedIds)
  && equalIds(current.orderedIds, next.orderedIds)
  && equalIds(current.visibleIds, next.visibleIds)
))

interface RuntimeCache {
  view?: View
  fieldsById?: ReadonlyMap<FieldId, Field>
  recordState?: ResolvedViewRecordState
  sectionProjection?: {
    appearances: ReadonlyMap<AppearanceId, Appearance>
    sections: readonly ProjectionSection[]
  }
  rowsById?: ReadonlyMap<RecordId, Row>
}

const createRuntimeCache = (): RuntimeCache => ({})

const resolveRuntimeView = (
  next: StageNext,
  cache: RuntimeCache
): View | undefined => {
  if (cache.view !== undefined) {
    return cache.view
  }

  cache.view = next.activeViewId
    ? resolveViewRecordState(next.document, next.activeViewId).view
    : undefined
  return cache.view
}

const resolveFieldsById = (
  next: StageNext,
  cache: RuntimeCache
): ReadonlyMap<FieldId, Field> => {
  if (cache.fieldsById) {
    return cache.fieldsById
  }

  cache.fieldsById = new Map(
    getDocumentFields(next.document).map(field => [field.id, field] as const)
  )
  return cache.fieldsById
}

const resolveRuntimeRecordState = (
  next: StageNext,
  cache: RuntimeCache
): ResolvedViewRecordState => {
  if (cache.recordState) {
    return cache.recordState
  }

  cache.recordState = resolveViewRecordState(next.document, next.activeViewId)
  return cache.recordState
}

const resolveRuntimeSectionProjection = (
  next: StageNext,
  cache: RuntimeCache
) => {
  if (cache.sectionProjection) {
    return cache.sectionProjection
  }

  const recordState = resolveRuntimeRecordState(next, cache)
  if (!recordState.view) {
    cache.sectionProjection = {
      appearances: new Map(),
      sections: []
    }
    return cache.sectionProjection
  }

  cache.sectionProjection = buildSectionProjection({
    document: next.document,
    view: recordState.view,
    visibleRecords: recordState.visibleRecords
  })
  return cache.sectionProjection
}

const resolveRowsById = (
  next: StageNext,
  cache: RuntimeCache
): ReadonlyMap<RecordId, Row> => {
  if (cache.rowsById) {
    return cache.rowsById
  }

  const recordState = resolveRuntimeRecordState(next, cache)
  cache.rowsById = new Map(
    recordState.visibleRecords.map(record => [record.id, record] as const)
  )
  return cache.rowsById
}

const createStageRead = (
  next: StageNext,
  cache: RuntimeCache
): StageRead => ({
  view: () => resolveRuntimeView(next, cache),
  fieldsById: () => resolveFieldsById(next, cache),
  recordState: () => resolveRuntimeRecordState(next, cache),
  sectionProjection: () => resolveRuntimeSectionProjection(next, cache),
  rowsById: () => resolveRowsById(next, cache)
})

const runStages = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  index: IndexState
  plan: ProjectPlan
  prev: ProjectState
}): ProjectState => {
  const cache = createRuntimeCache()
  const next: StageNext = {
    document: input.document,
    activeViewId: input.activeViewId,
    delta: input.delta,
    index: input.index,
    read: undefined as unknown as StageRead
  }
  next.read = createStageRead(next, cache)

  const run = <T,>(
    project: ProjectState,
    key: keyof ProjectState,
    action: ProjectPlan[keyof ProjectPlan],
    stage: {
      run: (input: {
        action: ProjectPlan[keyof ProjectPlan]
        prev?: T
        project: ProjectState
        next: StageNext
      }) => T | undefined
    }
  ): ProjectState => ({
    ...project,
    [key]: stage.run({
      action,
      prev: project[key] as T | undefined,
      project,
      next
    })
  })

  let project = {
    ...emptyProjectState(),
    ...input.prev
  }

  project = run(project, 'view', input.plan.view, viewStage)
  project = run(project, 'search', input.plan.search, searchStage)
  project = run(project, 'filter', input.plan.filter, filterStage)
  project = run(project, 'sort', input.plan.sort, sortStage)
  project = run(project, 'group', input.plan.group, groupStage)
  project = run(project, 'records', input.plan.records, recordsStage)
  project = run(project, 'sections', input.plan.sections, sectionsStage)
  project = run(project, 'appearances', input.plan.appearances, appearancesStage)
  project = run(project, 'fields', input.plan.fields, fieldsStage)
  project = run(project, 'calculations', input.plan.calculations, calculationsStage)

  return project
}

export interface ProjectRuntime extends EngineProjectApi {
  clear: () => void
  state: () => ProjectState
  syncDocument: (document: DataDoc, delta?: CommitDelta) => ProjectState
}

export const createProjectRuntime = (input: {
  document: DataDoc
}): ProjectRuntime => {
  const stores = {
    view: createValueStore<ActiveView | undefined>({ initial: undefined, isEqual: equalActiveView }),
    filter: createValueStore<ViewFilterProjection | undefined>({ initial: undefined, isEqual: equalFilterProjection }),
    group: createValueStore<ViewGroupProjection | undefined>({ initial: undefined, isEqual: equalGroupProjection }),
    search: createValueStore<ViewSearchProjection | undefined>({ initial: undefined, isEqual: equalSearchProjection }),
    sort: createValueStore<ViewSortProjection | undefined>({ initial: undefined, isEqual: equalSortProjection }),
    records: createValueStore<RecordSet | undefined>({ initial: undefined, isEqual: equalRecordSet }),
    sections: createValueStore<readonly Section[] | undefined>({ initial: undefined, isEqual: (left, right) => equalProjection(left, right, sameSections) }),
    appearances: createValueStore<AppearanceList | undefined>({ initial: undefined, isEqual: (left, right) => equalProjection(left, right, sameAppearanceList) }),
    fields: createValueStore<FieldList | undefined>({ initial: undefined, isEqual: (left, right) => equalProjection(left, right, sameFieldList) }),
    calculations: createValueStore<ReadonlyMap<SectionKey, CalculationCollection> | undefined>({ initial: undefined, isEqual: (left, right) => equalProjection(left, right, sameCalculationsBySection) })
  }
  let current = emptyProjectState()
  const index = createEngineIndex(input.document)

  const commitState = (
    next: ProjectState
  ) => {
    current = next
    stores.view.set(next.view)
    stores.filter.set(next.filter)
    stores.group.set(next.group)
    stores.search.set(next.search)
    stores.sort.set(next.sort)
    stores.records.set(next.records)
    stores.sections.set(next.sections)
    stores.appearances.set(next.appearances)
    stores.fields.set(next.fields)
    stores.calculations.set(next.calculations)
  }

  const runtime: ProjectRuntime = {
    ...stores,
    clear: () => {
      commitState(emptyProjectState())
    },
    state: () => current,
    syncDocument: (document, delta) => {
      const nextDelta = delta ?? {
        summary: {
          records: true,
          fields: true,
          views: true,
          values: true,
          activeView: true,
          indexes: true
        },
        entities: {
          records: { update: 'all' },
          fields: { update: 'all' },
          views: { update: 'all' },
          values: {
            records: 'all',
            fields: 'all'
          }
        },
        semantics: [{
          kind: 'activeView.set',
          before: current.view?.id,
          after: document.activeViewId
        }]
      } satisfies CommitDelta
      const nextIndex = index.sync(document, nextDelta)
      const plan = buildProjectPlan({
        document,
        activeViewId: document.activeViewId,
        delta: nextDelta,
        project: current,
        index: nextIndex
      })
      const next = runStages({
        document,
        activeViewId: document.activeViewId,
        delta: nextDelta,
        index: nextIndex,
        plan,
        prev: current
      })
      commitState(next)
      return current
    }
  }

  runtime.syncDocument(
    input.document,
    createResetDelta(undefined, input.document)
  )

  return runtime
}
