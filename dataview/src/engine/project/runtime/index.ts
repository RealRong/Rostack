import type {
  BucketSort,
  CommitDelta,
  DataDoc,
  Field,
  FieldId,
  RecordId,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
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
  getDocumentViewById
} from '@dataview/core/document'
import {
  createValueStore
} from '@shared/store'
import {
  createEngineIndex
} from '../../index/runtime'
import type {
  IndexDemand,
  IndexState
} from '../../index/types'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from '../../index/shared'
import type {
  ActiveView,
  EngineProjectApi,
  EnginePerfOptions,
  IndexTrace,
  ProjectStageMetrics,
  ProjectStageName,
  ProjectStageTrace,
  ProjectTrace,
  PublishTrace,
  RecordSet
} from '../../types'
import {
  now
} from '../../perf/shared'
import {
  buildPublishedViewState,
  resolveFieldsById
} from '../publish'
import {
  buildAppearanceList
} from '../nav'
import type {
  AppearanceList,
  FieldList,
  Section,
  SectionKey
} from '../types'
import {
  sameAppearanceList,
  sameCalculationsBySection,
  sameFieldList,
  sameSections
} from './equality'
import {
  buildQueryState
} from './query'
import {
  syncSectionState,
  toPublishedSections
} from './sections'
import {
  syncCalcState,
  toPublishedCalculations
} from './calc'
import {
  emptyCalcState,
  emptyProjectionState,
  emptyProjectState,
  type ProjectionAction,
  type ProjectionDelta,
  type ProjectionState,
  type ProjectState
} from './state'

const ACTION_PRIORITY: Record<ProjectionAction, number> = {
  reuse: 0,
  sync: 1,
  rebuild: 2
}

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

const setAction = (
  action: ProjectionAction,
  next: ProjectionAction
): ProjectionAction => (
  ACTION_PRIORITY[next] > ACTION_PRIORITY[action]
    ? next
    : action
)

const hasIntersection = (
  left: ReadonlySet<FieldId>,
  right: ReadonlySet<FieldId>
) => {
  for (const value of left) {
    if (right.has(value)) {
      return true
    }
  }

  return false
}

const viewSearchFields = (
  view: View
): ReadonlySet<FieldId> | 'all' => (
  view.search.fields?.length
    ? new Set(view.search.fields)
    : 'all'
)

const viewFilterFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.filter.rules.map(rule => rule.fieldId))

const viewSortFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.sort.map(sorter => sorter.field))

const viewCalcFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  Object.entries(view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
)

const viewDisplayFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.display.fields)

const queryUsesChangedFields = (
  fields: ReadonlySet<FieldId> | 'all',
  changedFields: ReadonlySet<FieldId>
) => fields === 'all'
  ? changedFields.size > 0
  : hasIntersection(fields, changedFields)

const resolveIndexDemand = (
  document: DataDoc,
  activeViewId?: ViewId
): IndexDemand => {
  const view = activeViewId
    ? getDocumentViewById(document, activeViewId)
    : undefined
  if (!view) {
    return {}
  }

  const search = view.search.fields?.length
    ? { fields: view.search.fields }
    : { all: true }

  return {
    ...(search ? { search } : {}),
    ...(view.group?.field ? { groupFields: [view.group.field] } : {}),
    ...(view.sort.length ? { sortFields: view.sort.map(sorter => sorter.field) } : {}),
    ...(Object.entries(view.calc).some(([, metric]) => Boolean(metric))
      ? {
          calculationFields: Object.entries(view.calc)
            .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
        }
      : {})
  }
}

const collectTouchedFields = (
  delta: CommitDelta
): ReadonlySet<FieldId> | 'all' => {
  if (
    delta.entities.fields?.update === 'all'
    || delta.entities.values?.fields === 'all'
  ) {
    return 'all'
  }

  return new Set([
    ...collectSchemaFieldIds(delta),
    ...collectValueFieldIds(delta, { includeTitlePatch: true })
  ])
}

const createProjectionDelta = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  project: ProjectState
}): ProjectionDelta => {
  const touchedRecords = collectTouchedRecordIds(input.delta)
  const touchedFields = collectTouchedFields(input.delta)
  const all: ProjectionDelta = {
    query: { action: 'rebuild' },
    sections: { action: 'rebuild', touchedRecords },
    calc: { action: 'rebuild', touchedRecords, touchedFields },
    nav: { action: 'rebuild' },
    adapters: { action: 'sync' }
  }

  if (
    input.delta.semantics.some(item => item.kind === 'activeView.set')
    || input.project.view?.id !== input.activeViewId
  ) {
    return all
  }

  const activeView = input.activeViewId
    ? getDocumentViewById(input.document, input.activeViewId)
    : undefined
  if (!activeView) {
    return all
  }

  const queryFields = {
    search: viewSearchFields(activeView),
    filter: viewFilterFields(activeView),
    sort: viewSortFields(activeView)
  }
  const calcFields = viewCalcFields(activeView)
  const displayFields = viewDisplayFields(activeView)
  const groupField = activeView.group?.field

  let queryAction: ProjectionAction = 'reuse'
  let sectionsAction: ProjectionAction = 'reuse'
  let calcAction: ProjectionAction = 'reuse'
  let navAction: ProjectionAction = 'reuse'
  let adaptersAction: ProjectionAction = 'sync'

  for (const item of input.delta.semantics) {
    switch (item.kind) {
      case 'view.query':
        if (item.viewId !== input.activeViewId) {
          break
        }
        if (
          item.aspects.includes('search')
          || item.aspects.includes('filter')
          || item.aspects.includes('sort')
          || item.aspects.includes('order')
        ) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (item.aspects.includes('group')) {
          sectionsAction = setAction(sectionsAction, 'rebuild')
          calcAction = setAction(calcAction, 'rebuild')
          navAction = setAction(navAction, 'rebuild')
        }
        break
      case 'view.layout':
        if (item.viewId !== input.activeViewId) {
          break
        }
        if (item.aspects.includes('display')) {
          adaptersAction = setAction(adaptersAction, 'sync')
        }
        if (item.aspects.includes('name') || item.aspects.includes('type')) {
          adaptersAction = setAction(adaptersAction, 'sync')
        }
        break
      case 'view.calculations':
        if (item.viewId !== input.activeViewId) {
          break
        }
        calcAction = setAction(calcAction, 'rebuild')
        break
      case 'field.schema': {
        const changedField = item.fieldId
        if (displayFields.has(changedField)) {
          adaptersAction = setAction(adaptersAction, 'sync')
        }
        if (
          activeView.search.query.trim()
          && touchedFields !== 'all'
          && queryUsesChangedFields(queryFields.search, new Set([changedField]))
        ) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (queryFields.filter.has(changedField) || queryFields.sort.has(changedField)) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (groupField === changedField) {
          sectionsAction = setAction(sectionsAction, 'rebuild')
          calcAction = setAction(calcAction, 'rebuild')
          navAction = setAction(navAction, 'rebuild')
        }
        if (calcFields.has(changedField)) {
          calcAction = setAction(calcAction, 'rebuild')
        }
        break
      }
      case 'record.add':
      case 'record.remove':
        queryAction = setAction(queryAction, 'sync')
        sectionsAction = setAction(sectionsAction, 'rebuild')
        calcAction = setAction(calcAction, 'rebuild')
        navAction = setAction(navAction, 'rebuild')
        break
      case 'record.patch': {
        const changedFields = new Set<FieldId>(
          item.aspects.includes('title')
            ? [TITLE_FIELD_ID]
            : []
        )
        if (
          activeView.search.query.trim()
          && queryUsesChangedFields(queryFields.search, changedFields)
        ) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (
          hasIntersection(queryFields.filter, changedFields)
          || hasIntersection(queryFields.sort, changedFields)
        ) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (groupField && changedFields.has(groupField)) {
          sectionsAction = setAction(sectionsAction, 'sync')
          navAction = setAction(navAction, 'sync')
        }
        if (hasIntersection(calcFields, changedFields)) {
          calcAction = setAction(calcAction, 'sync')
        }
        break
      }
      case 'record.values': {
        const changedFields = item.fields === 'all'
          ? 'all'
          : new Set(item.fields)
        if (
          activeView.search.query.trim()
          && (
            changedFields === 'all'
            || queryUsesChangedFields(queryFields.search, changedFields)
          )
        ) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (
          changedFields === 'all'
          || hasIntersection(queryFields.filter, changedFields)
          || hasIntersection(queryFields.sort, changedFields)
        ) {
          queryAction = setAction(queryAction, 'sync')
        }
        if (
          groupField
          && (
            changedFields === 'all'
            || changedFields.has(groupField)
          )
        ) {
          sectionsAction = setAction(sectionsAction, 'sync')
          navAction = setAction(navAction, 'sync')
        }
        if (
          changedFields === 'all'
          || hasIntersection(calcFields, changedFields)
        ) {
          calcAction = setAction(calcAction, 'sync')
        }
        break
      }
    }
  }

  if (queryAction !== 'reuse') {
    sectionsAction = setAction(sectionsAction, 'rebuild')
    calcAction = setAction(calcAction, 'rebuild')
    navAction = setAction(navAction, 'rebuild')
  }

  if (sectionsAction === 'sync') {
    calcAction = setAction(calcAction, 'sync')
    navAction = setAction(navAction, 'sync')
  }

  if (calcAction !== 'reuse' && sectionsAction === 'reuse') {
    navAction = setAction(navAction, 'reuse')
  }

  return {
    query: { action: queryAction },
    sections: {
      action: sectionsAction,
      touchedRecords
    },
    calc: {
      action: calcAction,
      touchedRecords,
      touchedFields
    },
    nav: { action: navAction },
    adapters: { action: adaptersAction }
  }
}

const createRecordSet = (
  activeViewId: ViewId,
  projection: ProjectionState['query']
): RecordSet => ({
  viewId: activeViewId,
  derivedIds: projection.derived,
  orderedIds: projection.ordered,
  visibleIds: projection.visible
})

const countChangedIds = (
  previous: readonly string[] | undefined,
  next: readonly string[] | undefined
): number | undefined => {
  if (!previous || !next) {
    return next?.length
  }

  if (previous === next) {
    return 0
  }

  return previous.length !== next.length
    ? Math.max(previous.length, next.length)
    : undefined
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

  return previous.ids === next.ids
    && previous.idsBySection === next.idsBySection
    ? next.count
    : 0
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
    case 'query': {
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
      const changedRecordCount = countChangedIds(previousRecords?.visibleIds, nextRecords.visibleIds)

      return {
        inputCount: previousRecords?.visibleIds.length,
        outputCount: nextRecords.visibleIds.length,
        reusedNodeCount,
        rebuiltNodeCount: 3 - reusedNodeCount,
        ...(changedRecordCount === undefined ? {} : { changedRecordCount })
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
    case 'calc': {
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
    case 'nav': {
      const previousAppearances = previous as AppearanceList | undefined
      const nextAppearances = next as AppearanceList | undefined
      if (!nextAppearances) {
        return undefined
      }

      const reusedNodeCount = countReusedAppearances(previousAppearances, nextAppearances)
      const changedRecordCount = countChangedIds(previousAppearances?.ids, nextAppearances.ids)
      return {
        inputCount: previousAppearances?.ids.length,
        outputCount: nextAppearances.ids.length,
        reusedNodeCount,
        rebuiltNodeCount: nextAppearances.count - reusedNodeCount,
        ...(changedRecordCount === undefined ? {} : { changedRecordCount })
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

interface ProjectSyncTrace {
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
  projection: ProjectionState
  published: ProjectState
  trace?: ProjectTrace
}

const runProjection = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  projectionDelta: ProjectionDelta
  index: IndexState
  previousProjection: ProjectionState
  previousPublished: ProjectState
  capturePerf: boolean
}): ProjectRunResult => {
  const totalStart = now()
  const stageTraces: ProjectStageTrace[] = []
  const view = input.activeViewId
    ? getDocumentViewById(input.document, input.activeViewId)
    : undefined
  const fieldsById = resolveFieldsById(input.document)

  const traceStage = <T,>(
    stage: ProjectStageName,
    action: ProjectionAction,
    previousValue: T,
    nextValue: T,
    metrics?: ProjectStageMetrics
  ) => {
    if (!input.capturePerf) {
      return
    }

    stageTraces.push({
      stage,
      action,
      executed: action !== 'reuse',
      changed: !Object.is(previousValue, nextValue),
      durationMs: 0,
      ...(metrics ? { metrics } : {})
    })
  }

  const timeStage = <T,>(
    stage: ProjectStageName,
    action: ProjectionAction,
    run: () => T,
    previousValue: T,
    buildMetrics?: (nextValue: T) => ProjectStageMetrics | undefined
  ): T => {
    if (action === 'reuse') {
      traceStage(
        stage,
        action,
        previousValue,
        previousValue,
        buildMetrics?.(previousValue)
      )
      return previousValue
    }

    const start = input.capturePerf ? now() : 0
    const nextValue = run()
    if (input.capturePerf) {
      stageTraces.push({
        stage,
        action,
        executed: true,
        changed: !Object.is(previousValue, nextValue),
        durationMs: now() - start,
        ...(buildMetrics
          ? {
              metrics: buildMetrics(nextValue)
            }
          : {})
      })
    }
    return nextValue
  }

  const query = view
    ? timeStage(
        'query',
        input.projectionDelta.query.action,
        () => buildQueryState({
          document: input.document,
          view,
          index: input.index,
          previous: input.previousProjection.query
        }),
        input.previousProjection.query,
        nextValue => buildStageMetrics(
          'query',
          input.previousPublished.records,
          input.activeViewId
            ? createRecordSet(input.activeViewId, nextValue)
            : undefined
        )
      )
    : input.previousProjection.query

  const sections = view
    ? timeStage(
        'sections',
        input.projectionDelta.sections.action,
        () => syncSectionState({
          previous: input.previousProjection.sections,
          previousQuery: input.previousProjection.query,
          document: input.document,
          view,
          query,
          index: input.index,
          touchedRecords: input.projectionDelta.sections.touchedRecords,
          action: input.projectionDelta.sections.action
        }),
        input.previousProjection.sections
      )
    : input.previousProjection.sections

  const calc = view
    ? timeStage(
        'calc',
        input.projectionDelta.calc.action,
        () => syncCalcState({
          previous: input.previousProjection.calc,
          previousSections: input.previousProjection.sections,
          sections,
          view,
          index: input.index,
          action: input.projectionDelta.calc.action,
          touchedRecords: input.projectionDelta.calc.touchedRecords,
          touchedFields: input.projectionDelta.calc.touchedFields
        }),
        input.previousProjection.calc
      )
    : emptyCalcState()

  const nav = view
    ? timeStage(
        'nav',
        input.projectionDelta.nav.action,
        () => ({
          appearances: buildAppearanceList(
            sections,
            input.previousProjection.nav?.appearances,
            input.previousProjection.sections
          )
        }),
        input.previousProjection.nav ?? {
          appearances: buildAppearanceList(input.previousProjection.sections)
        },
        nextValue => buildStageMetrics(
          'nav',
          input.previousPublished.appearances,
          nextValue.appearances
        )
      )
    : undefined

  const published = timeStage(
    'adapters',
    input.projectionDelta.adapters.action,
    () => {
      const thin = buildPublishedViewState({
        document: input.document,
        viewId: input.activeViewId
      })

      const records = view && input.activeViewId
        ? createRecordSet(input.activeViewId, query)
        : undefined
      const appearances = nav?.appearances
      const sectionsView = appearances
        ? toPublishedSections({
            sections,
            appearances,
            previous: input.previousPublished.sections
          })
        : undefined
      const calculations = view
        ? toPublishedCalculations({
            calc,
            previousCalc: input.previousProjection.calc,
            previous: input.previousPublished.calculations,
            fieldsById,
            view
          })
        : undefined

      return {
        view: thin.view,
        filter: thin.filter,
        group: thin.group,
        search: thin.search,
        sort: thin.sort,
        records,
        sections: sectionsView,
        appearances,
        fields: thin.fields,
        calculations
      } satisfies ProjectState
    },
    input.previousPublished
  )

  if (input.capturePerf) {
    const adaptersTrace = stageTraces.find(stage => stage.stage === 'adapters')
    if (adaptersTrace) {
      adaptersTrace.metrics = {
        changedSectionCount: 0,
        outputCount: Object.values(published).filter(Boolean).length
      }
    }
    const sectionsTrace = stageTraces.find(stage => stage.stage === 'sections')
    if (sectionsTrace) {
      sectionsTrace.metrics = buildStageMetrics(
        'sections',
        input.previousPublished.sections,
        published.sections
      )
      sectionsTrace.changed = !equalProjectValue('sections', input.previousPublished.sections, published.sections)
    }
    const calcTrace = stageTraces.find(stage => stage.stage === 'calc')
    if (calcTrace) {
      calcTrace.metrics = buildStageMetrics(
        'calc',
        input.previousPublished.calculations,
        published.calculations
      )
      calcTrace.changed = !equalProjectValue('calculations', input.previousPublished.calculations, published.calculations)
    }
    const navTrace = stageTraces.find(stage => stage.stage === 'nav')
    if (navTrace) {
      navTrace.changed = !equalProjectValue('appearances', input.previousPublished.appearances, published.appearances)
    }
  }

  return {
    projection: {
      query,
      sections,
      calc,
      ...(nav ? { nav } : {})
    },
    published,
    ...(input.capturePerf
      ? {
          trace: {
            plan: {
              query: input.projectionDelta.query.action,
              sections: input.projectionDelta.sections.action,
              calc: input.projectionDelta.calc.action,
              nav: input.projectionDelta.nav.action,
              adapters: input.projectionDelta.adapters.action
            },
            timings: {
              totalMs: now() - totalStart
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
  const capturePerf = Boolean(input.perf?.trace || input.perf?.stats)
  const storeKeys = Object.keys(stores) as (keyof typeof stores)[]
  const index = createEngineIndex(
    input.document,
    resolveIndexDemand(input.document, input.document.activeViewId)
  )
  let currentProjection = emptyProjectionState()
  let currentPublished = emptyProjectState()

  const commitState = (
    next: ProjectState
  ): PublishTrace | undefined => {
    const changedStores = capturePerf
      ? storeKeys.flatMap(key => equalProjectValue(
          key,
          currentPublished[key],
          next[key]
        )
          ? []
          : [key])
      : []

    currentPublished = next
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

  const sync = (
    document: DataDoc,
    delta?: CommitDelta
  ): ProjectSyncResult => {
    const totalStart = capturePerf ? now() : 0
    const nextDelta = delta ?? createResetDelta(undefined, document)
    const indexResult = index.sync(
      document,
      nextDelta,
      resolveIndexDemand(document, document.activeViewId)
    )
    const projectionDelta = createProjectionDelta({
      document,
      activeViewId: document.activeViewId,
      delta: nextDelta,
      project: currentPublished
    })
    const runResult = runProjection({
      document,
      activeViewId: document.activeViewId,
      delta: nextDelta,
      projectionDelta,
      index: indexResult.state,
      previousProjection: currentProjection,
      previousPublished: currentPublished,
      capturePerf
    })
    currentProjection = runResult.projection
    const publishStart = capturePerf ? now() : 0
    const publish = commitState(runResult.published)

    return {
      state: currentPublished,
      ...(capturePerf && indexResult.trace && runResult.trace && publish
        ? {
            trace: {
              timings: {
                totalMs: now() - totalStart,
                indexMs: indexResult.trace.timings.totalMs,
                projectMs: runResult.trace.timings.totalMs,
                publishMs: now() - publishStart
              },
              index: indexResult.trace,
              project: runResult.trace,
              publish
            }
          }
        : {})
    }
  }

  const runtime: ProjectRuntime = {
    ...stores,
    clear: () => {
      currentProjection = emptyProjectionState()
      commitState(emptyProjectState())
    },
    state: () => currentPublished,
    syncDocument: sync
  }

  sync(input.document, createResetDelta(undefined, input.document))

  return runtime
}
