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
  getDocumentFields,
  getDocumentViewById
} from '@dataview/core/document'
import {
  createValueStore
} from '@shared/store'
import {
  createEngineIndex
} from '../../index/runtime'
import type {
  IndexState
} from '../../index/types'
import type {
  ActiveView,
  EngineProjectApi,
  RecordSet
} from '../../types'
import {
  now
} from '../../perf/shared'
import {
  appearancesStage
} from '../stages/appearances'
import {
  calculationsStage
} from '../stages/calculations'
import {
  sameAppearanceList,
  sameCalculationsBySection,
  sameFieldList,
  sameSections
} from './equality'
import {
  fieldsStage
} from '../stages/fields'
import {
  filterStage
} from '../stages/filter'
import {
  groupStage
} from '../stages/group'
import {
  recordsStage
} from '../stages/records'
import {
  resolveIndexedViewRecordState,
  type ResolvedViewRecordState
} from './recordState'
import {
  searchStage
} from '../stages/search'
import {
  sortStage
} from '../stages/sort'
import type {
  StageNext,
  StageRead
} from './stage'
import {
  buildProjectPlan,
  type ProjectPlan
} from './planner'
import {
  shouldRun
} from './stage'
import {
  buildSectionProjection,
  sectionsStage
} from '../stages/sections'
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
} from '../types'
import { viewStage } from '../stages/view'
import type {
  EnginePerfOptions,
  IndexTrace,
  ProjectStageMetrics,
  ProjectStageName,
  ProjectStageTrace,
  ProjectTrace,
  PublishTrace
} from '../../types'

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
}

export interface ProjectSyncTrace {
  timings: {
    totalMs: number
    indexMs?: number
    projectMs?: number
    publishMs?: number
  }
  index: IndexTrace
  project: ProjectTrace
  publish: PublishTrace
}

export interface ProjectSyncResult {
  state: ProjectState
  trace?: ProjectSyncTrace
}

interface ProjectRunResult {
  state: ProjectState
  trace?: ProjectTrace
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
    ? getDocumentViewById(next.document, next.activeViewId)
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

  cache.recordState = resolveIndexedViewRecordState({
    document: next.document,
    activeViewId: next.activeViewId,
    index: next.index
  })
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
    visibleRecords: recordState.visibleRecords,
    index: next.index
  })
  return cache.sectionProjection
}

const createStageRead = (
  next: StageNext,
  cache: RuntimeCache
): StageRead => ({
  view: () => resolveRuntimeView(next, cache),
  fieldsById: () => resolveFieldsById(next, cache),
  recordState: () => resolveRuntimeRecordState(next, cache),
  sectionProjection: () => resolveRuntimeSectionProjection(next, cache),
})

const countChangedIds = (
  previous: readonly string[] | undefined,
  next: readonly string[] | undefined
) => {
  const left = new Set(previous ?? [])
  const right = new Set(next ?? [])
  return new Set([
    ...Array.from(left).filter(value => !right.has(value)),
    ...Array.from(right).filter(value => !left.has(value))
  ]).size
}

const countReusedSections = (
  previous: readonly Section[] | undefined,
  next: readonly Section[] | undefined
) => {
  if (!previous?.length || !next?.length) {
    return 0
  }

  const previousByKey = new Map(previous.map(section => [section.key, section] as const))
  return next.reduce((count, section) => count + (
    previousByKey.get(section.key) === section ? 1 : 0
  ), 0)
}

const countChangedSections = (
  previous: readonly Section[] | undefined,
  next: readonly Section[] | undefined
) => {
  const previousByKey = new Map((previous ?? []).map(section => [section.key, section] as const))
  const nextByKey = new Map((next ?? []).map(section => [section.key, section] as const))
  const keys = new Set([
    ...Array.from(previousByKey.keys()),
    ...Array.from(nextByKey.keys())
  ])

  return Array.from(keys).reduce((count, key) => count + (
    previousByKey.get(key) === nextByKey.get(key) ? 0 : 1
  ), 0)
}

const countReusedAppearances = (
  previous: AppearanceList | undefined,
  next: AppearanceList | undefined
) => {
  if (!previous || !next) {
    return 0
  }

  return next.ids.reduce((count, id) => count + (
    previous.byId.get(id) === next.byId.get(id) ? 1 : 0
  ), 0)
}

const countReusedCalculations = (
  previous: ReadonlyMap<SectionKey, CalculationCollection> | undefined,
  next: ReadonlyMap<SectionKey, CalculationCollection> | undefined
) => {
  if (!previous || !next) {
    return 0
  }

  return Array.from(next.entries()).reduce((count, [sectionKey, collection]) => count + (
    previous.get(sectionKey) === collection ? 1 : 0
  ), 0)
}

const buildStageMetrics = (
  stage: ProjectStageName,
  previous: ProjectState[keyof ProjectState],
  next: ProjectState[keyof ProjectState]
): ProjectStageMetrics | undefined => {
  switch (stage) {
    case 'view':
      return (next as ActiveView | undefined)
        ? {
            outputCount: 1
          }
        : undefined
    case 'search': {
      const nextSearch = next as ViewSearchProjection | undefined
      return nextSearch
        ? {
            outputCount: nextSearch.active ? 1 : 0,
            inputCount: nextSearch.fields?.length
          }
        : undefined
    }
    case 'filter': {
      const nextFilter = next as ViewFilterProjection | undefined
      return nextFilter
        ? {
            outputCount: nextFilter.rules.length
          }
        : undefined
    }
    case 'sort': {
      const nextSort = next as ViewSortProjection | undefined
      return nextSort
        ? {
            outputCount: nextSort.rules.length
          }
        : undefined
    }
    case 'group': {
      const nextGroup = next as ViewGroupProjection | undefined
      return nextGroup
        ? {
            outputCount: nextGroup.active ? 1 : 0
          }
        : undefined
    }
    case 'fields': {
      const nextFields = next as FieldList | undefined
      return nextFields
        ? {
            outputCount: nextFields.ids.length
          }
        : undefined
    }
    case 'records': {
      const previousRecords = previous as RecordSet | undefined
      const nextRecords = next as RecordSet | undefined
      if (!nextRecords) {
        return undefined
      }

      const reusedNodeCount = (
        (previousRecords?.derivedIds === nextRecords.derivedIds ? 1 : 0)
        + (previousRecords?.orderedIds === nextRecords.orderedIds ? 1 : 0)
        + (previousRecords?.visibleIds === nextRecords.visibleIds ? 1 : 0)
      )

      return {
        inputCount: previousRecords?.visibleIds.length,
        outputCount: nextRecords.visibleIds.length,
        reusedNodeCount,
        rebuiltNodeCount: 3 - reusedNodeCount,
        changedRecordCount: countChangedIds(previousRecords?.visibleIds, nextRecords.visibleIds)
      }
    }
    case 'sections': {
      const previousSections = previous as readonly Section[] | undefined
      const nextSections = next as readonly Section[] | undefined
      if (!nextSections) {
        return undefined
      }

      const reusedNodeCount = countReusedSections(previousSections, nextSections)
      return {
        inputCount: previousSections?.length,
        outputCount: nextSections.length,
        reusedNodeCount,
        rebuiltNodeCount: nextSections.length - reusedNodeCount,
        changedSectionCount: countChangedSections(previousSections, nextSections)
      }
    }
    case 'appearances': {
      const previousAppearances = previous as AppearanceList | undefined
      const nextAppearances = next as AppearanceList | undefined
      if (!nextAppearances) {
        return undefined
      }

      const reusedNodeCount = countReusedAppearances(previousAppearances, nextAppearances)
      return {
        inputCount: previousAppearances?.ids.length,
        outputCount: nextAppearances.ids.length,
        reusedNodeCount,
        rebuiltNodeCount: nextAppearances.byId.size - reusedNodeCount,
        changedRecordCount: countChangedIds(previousAppearances?.ids, nextAppearances.ids)
      }
    }
    case 'calculations': {
      const previousCalculations = previous as ReadonlyMap<SectionKey, CalculationCollection> | undefined
      const nextCalculations = next as ReadonlyMap<SectionKey, CalculationCollection> | undefined
      if (!nextCalculations) {
        return undefined
      }

      const reusedNodeCount = countReusedCalculations(previousCalculations, nextCalculations)
      return {
        inputCount: previousCalculations?.size,
        outputCount: nextCalculations.size,
        reusedNodeCount,
        rebuiltNodeCount: nextCalculations.size - reusedNodeCount,
        changedSectionCount: nextCalculations.size - reusedNodeCount
      }
    }
    default:
      return undefined
  }
}

const equalProjectValue = (
  key: keyof ProjectState,
  previous: ProjectState[keyof ProjectState],
  next: ProjectState[keyof ProjectState]
) => {
  switch (key) {
    case 'view':
      return equalProjection(previous as ActiveView | undefined, next as ActiveView | undefined, equalActiveView)
    case 'filter':
      return equalProjection(previous as ViewFilterProjection | undefined, next as ViewFilterProjection | undefined, equalFilterProjection)
    case 'group':
      return equalProjection(previous as ViewGroupProjection | undefined, next as ViewGroupProjection | undefined, equalGroupProjection)
    case 'search':
      return equalProjection(previous as ViewSearchProjection | undefined, next as ViewSearchProjection | undefined, equalSearchProjection)
    case 'sort':
      return equalProjection(previous as ViewSortProjection | undefined, next as ViewSortProjection | undefined, equalSortProjection)
    case 'records':
      return equalProjection(previous as RecordSet | undefined, next as RecordSet | undefined, equalRecordSet)
    case 'sections':
      return equalProjection(previous as readonly Section[] | undefined, next as readonly Section[] | undefined, sameSections)
    case 'appearances':
      return equalProjection(previous as AppearanceList | undefined, next as AppearanceList | undefined, sameAppearanceList)
    case 'fields':
      return equalProjection(previous as FieldList | undefined, next as FieldList | undefined, sameFieldList)
    case 'calculations':
      return equalProjection(
        previous as ReadonlyMap<SectionKey, CalculationCollection> | undefined,
        next as ReadonlyMap<SectionKey, CalculationCollection> | undefined,
        sameCalculationsBySection
      )
    default:
      return Object.is(previous, next)
  }
}

const runStages = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  index: IndexState
  indexTrace?: IndexTrace
  plan: ProjectPlan
  prev: ProjectState
  capturePerf: boolean
}): ProjectRunResult => {
  const totalStart = now()
  const cache = createRuntimeCache()
  const next: StageNext = {
    document: input.document,
    activeViewId: input.activeViewId,
    delta: input.delta,
    index: input.index,
    read: undefined as unknown as StageRead
  }
  next.read = createStageRead(next, cache)
  const stageTraces: ProjectStageTrace[] = []

  const run = <T,>(
    project: ProjectState,
    key: keyof ProjectState,
    action: ProjectPlan[keyof ProjectPlan],
    stage: {
      run: (input: {
        action: ProjectPlan[keyof ProjectPlan]
        prev?: T
        project: ProjectState
        previous: ProjectState
        next: StageNext
      }) => T | undefined
    }
  ): ProjectState => ({
    ...project,
    [key]: (() => {
      const previousValue = project[key] as T | undefined
      const executed = shouldRun(action)
      const stageStart = input.capturePerf ? now() : 0
      const nextValue = stage.run({
        action,
        prev: previousValue,
        project,
        previous: input.prev,
        next
      })
      if (input.capturePerf) {
        const durationMs = now() - stageStart
        const changed = !equalProjectValue(
          key,
          previousValue as ProjectState[keyof ProjectState],
          nextValue as ProjectState[keyof ProjectState]
        )
        stageTraces.push({
          stage: key as ProjectStageName,
          action,
          executed,
          changed,
          durationMs,
          ...(executed
            ? {
                metrics: buildStageMetrics(
                  key as ProjectStageName,
                  previousValue as ProjectState[keyof ProjectState],
                  nextValue as ProjectState[keyof ProjectState]
                )
              }
            : {})
        })
      }
      return nextValue
    })()
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

  return {
    state: project,
    ...(input.capturePerf
      ? {
          trace: {
            timings: {
              totalMs: now() - totalStart
            },
            plan: {
              ...input.plan
            },
            stages: stageTraces
          } satisfies ProjectTrace
        }
      : {})
  }
}

export interface ProjectRuntime extends EngineProjectApi {
  clear: () => void
  state: () => ProjectState
  syncDocument: (document: DataDoc, delta?: CommitDelta) => ProjectSyncResult
}

export const createProjectRuntime = (input: {
  document: DataDoc
  perf?: EnginePerfOptions
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
  const capturePerf = Boolean(input.perf?.trace || input.perf?.stats)
  const storeKeys = Object.keys(stores) as (keyof typeof stores)[]

  const commitState = (
    next: ProjectState
  ): PublishTrace | undefined => {
    const changedStores = capturePerf
      ? storeKeys.flatMap(key => equalProjectValue(
          key,
          current[key],
          next[key]
        )
          ? []
          : [key])
      : []

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

    return capturePerf
      ? {
          storeCount: storeKeys.length,
          changedStores
        }
      : undefined
  }

  const runtime: ProjectRuntime = {
    ...stores,
    clear: () => {
      commitState(emptyProjectState())
    },
    state: () => current,
    syncDocument: (document, delta) => {
      const totalStart = capturePerf ? now() : 0
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
      const indexResult = index.sync(document, nextDelta)
      const plan = buildProjectPlan({
        document,
        activeViewId: document.activeViewId,
        delta: nextDelta,
        project: current,
        index: indexResult.state
      })
      const stageResult = runStages({
        document,
        activeViewId: document.activeViewId,
        delta: nextDelta,
        index: indexResult.state,
        plan,
        prev: current,
        capturePerf
      })
      const publishStart = capturePerf ? now() : 0
      const publish = commitState(stageResult.state)

      return {
        state: current,
        ...(capturePerf && indexResult.trace && stageResult.trace && publish
          ? {
              trace: {
                timings: {
                  totalMs: now() - totalStart,
                  indexMs: indexResult.trace.timings.totalMs,
                  projectMs: stageResult.trace.timings.totalMs,
                  publishMs: now() - publishStart
                },
                index: indexResult.trace,
                project: stageResult.trace,
                publish
              }
            }
          : {})
      }
    }
  }

  runtime.syncDocument(
    input.document,
    createResetDelta(undefined, input.document)
  )

  return runtime
}
