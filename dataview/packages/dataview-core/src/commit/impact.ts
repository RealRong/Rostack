import type {
  CommitImpact,
  CommitSummary,
  FieldSchemaAspect,
  ViewQueryAspect
} from '@dataview/core/contracts/commit'
import type {
  DataDoc,
  FieldId,
  RecordId,
  ViewId
} from '@dataview/core/contracts/state'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts/state'
import {
  document
} from '@dataview/core/document'

const EMPTY_FIELD_IDS = new Set<FieldId>()
const EMPTY_RECORD_IDS = new Set<RecordId>()
const EMPTY_VIEW_IDS = new Set<ViewId>()

const setSize = <T>(
  value: ReadonlySet<T> | 'all' | undefined
): number => value === 'all'
  ? Number.POSITIVE_INFINITY
  : value?.size ?? 0

const cleanupSet = <T>(
  value: Set<T> | 'all' | undefined
): Set<T> | 'all' | undefined => {
  if (value === 'all') {
    return value
  }

  return value?.size
    ? value
    : undefined
}

const cleanupPlainSet = <T>(
  value: Set<T> | undefined
): Set<T> | undefined => value?.size
  ? value
  : undefined

const cleanupMap = <TKey, TValue>(
  value: Map<TKey, TValue> | undefined
): Map<TKey, TValue> | undefined => value?.size
  ? value
  : undefined

export const createCommitImpact = (): CommitImpact => ({})

export const createResetCommitImpact = (
  beforeDocument: DataDoc | undefined,
  afterDocument: DataDoc
): CommitImpact => {
  const beforeActiveViewId = beforeDocument
    ? document.views.activeId.get(beforeDocument)
    : undefined
  const afterActiveViewId = document.views.activeId.get(afterDocument)

  return {
    reset: true,
    records: {
      touched: 'all',
      valueChangedFields: 'all'
    },
    fields: {
      touched: 'all'
    },
    views: {
      touched: 'all'
    },
    ...(beforeActiveViewId === afterActiveViewId
      ? {}
      : {
          activeView: {
            before: beforeActiveViewId,
            after: afterActiveViewId
          }
        })
  }
}

export const finalizeCommitImpact = (
  impact: CommitImpact
): void => {
  if (impact.records) {
    impact.records.inserted = cleanupPlainSet(impact.records.inserted)
    impact.records.removed = cleanupPlainSet(impact.records.removed)
    impact.records.touched = cleanupSet(impact.records.touched)
    impact.records.titleChanged = cleanupPlainSet(impact.records.titleChanged)
    impact.records.valueChangedFields = cleanupSet(impact.records.valueChangedFields)

    impact.records.patched?.forEach((aspects, recordId) => {
      if (!aspects.size) {
        impact.records?.patched?.delete(recordId)
      }
    })
    impact.records.patched = cleanupMap(impact.records.patched)
    impact.records.recordSetChanged = Boolean(
      setSize(impact.records.inserted) || setSize(impact.records.removed)
    )

    if (
      !impact.records.inserted
      && !impact.records.removed
      && !impact.records.patched
      && !impact.records.touched
      && !impact.records.titleChanged
      && !impact.records.valueChangedFields
      && !impact.records.recordSetChanged
    ) {
      impact.records = undefined
    }
  }

  if (impact.fields) {
    impact.fields.inserted = cleanupPlainSet(impact.fields.inserted)
    impact.fields.removed = cleanupPlainSet(impact.fields.removed)
    impact.fields.schemaTouched = cleanupPlainSet(impact.fields.schemaTouched)
    impact.fields.touched = cleanupSet(impact.fields.touched)

    impact.fields.schema?.forEach((aspects, fieldId) => {
      if (!aspects.size) {
        impact.fields?.schema?.delete(fieldId)
      }
    })
    impact.fields.schema = cleanupMap(impact.fields.schema)

    if (
      !impact.fields.inserted
      && !impact.fields.removed
      && !impact.fields.schema
      && !impact.fields.schemaTouched
      && !impact.fields.touched
    ) {
      impact.fields = undefined
    }
  }

  if (impact.views) {
    impact.views.inserted = cleanupPlainSet(impact.views.inserted)
    impact.views.removed = cleanupPlainSet(impact.views.removed)
    impact.views.touched = cleanupSet(impact.views.touched)

    impact.views.changed?.forEach((change, viewId) => {
      change.queryAspects = cleanupPlainSet(change.queryAspects)
      change.layoutAspects = cleanupPlainSet(change.layoutAspects)
      change.calculationFields = cleanupSet(change.calculationFields)
      if (!change.queryAspects && !change.layoutAspects && !change.calculationFields) {
        impact.views?.changed?.delete(viewId)
      }
    })
    impact.views.changed = cleanupMap(impact.views.changed)

    if (!impact.views.inserted && !impact.views.removed && !impact.views.changed && !impact.views.touched) {
      impact.views = undefined
    }
  }

  if (
    impact.activeView
    && impact.activeView.before === impact.activeView.after
  ) {
    impact.activeView = undefined
  }

  if (
    impact.external
    && !impact.external.versionBumped
    && !impact.external.source
  ) {
    impact.external = undefined
  }
}

export const hasIndexImpact = (
  impact: CommitImpact
): boolean => Boolean(
  impact.reset
  || impact.records?.recordSetChanged
  || impact.records?.patched?.size
  || impact.records?.titleChanged?.size
  || impact.records?.valueChangedFields === 'all'
  || impact.records?.valueChangedFields?.size
  || impact.fields?.schema?.size
)

export const hasActiveViewImpact = (
  impact: CommitImpact
): boolean => Boolean(impact.reset || impact.activeView)

export const getViewChange = (
  impact: CommitImpact,
  viewId: ViewId
) => impact.views?.changed?.get(viewId)

export const hasViewQueryImpact = (
  impact: CommitImpact,
  viewId: ViewId,
  aspects?: readonly ViewQueryAspect[]
): boolean => {
  if (impact.reset) {
    return true
  }

  const change = impact.views?.changed?.get(viewId)
  if (!change?.queryAspects?.size) {
    return false
  }

  if (!aspects?.length) {
    return true
  }

  return aspects.some(aspect => change.queryAspects?.has(aspect))
}

export const collectSchemaFieldIds = (
  impact: CommitImpact
): ReadonlySet<FieldId> => impact.reset
  ? EMPTY_FIELD_IDS
  : impact.fields?.schemaTouched
    ?? (
      impact.fields?.schema?.size
        ? new Set<FieldId>(impact.fields.schema.keys())
        : EMPTY_FIELD_IDS
    )

export const collectValueFieldIds = (
  impact: CommitImpact,
  options?: {
    includeTitlePatch?: boolean
  }
): ReadonlySet<FieldId> | 'all' => {
  if (impact.reset || impact.records?.valueChangedFields === 'all') {
    return 'all'
  }

  const ids = impact.records?.valueChangedFields ?? EMPTY_FIELD_IDS
  if (options?.includeTitlePatch && impact.records?.titleChanged?.size) {
    const next = new Set<FieldId>(ids)
    next.add(TITLE_FIELD_ID)
    return next
  }

  return ids
}

export const collectTouchedFieldIds = (
  impact: CommitImpact,
  options?: {
    includeTitlePatch?: boolean
  }
): ReadonlySet<FieldId> | 'all' => {
  if (impact.reset || impact.fields?.touched === 'all') {
    return 'all'
  }

  if (options?.includeTitlePatch && impact.fields?.touched) {
    return impact.fields.touched
  }

  if (impact.fields?.touched) {
    return impact.fields.touched
  }

  const valueFields = collectValueFieldIds(impact, {
    includeTitlePatch: options?.includeTitlePatch
  })
  if (valueFields === 'all') {
    return 'all'
  }

  return new Set<FieldId>([
    ...collectSchemaFieldIds(impact),
    ...valueFields
  ])
}

export const collectTouchedRecordIds = (
  impact: CommitImpact
): ReadonlySet<RecordId> | 'all' => {
  if (impact.reset || impact.records?.touched === 'all') {
    return 'all'
  }

  if (impact.records?.touched) {
    return impact.records.touched
  }

  if (
    !impact.records?.inserted?.size
    && !impact.records?.removed?.size
    && !impact.records?.patched?.size
    && !impact.records?.titleChanged?.size
  ) {
    return EMPTY_RECORD_IDS
  }

  const touched = new Set<RecordId>()
  impact.records?.inserted?.forEach(recordId => touched.add(recordId))
  impact.records?.removed?.forEach(recordId => touched.add(recordId))
  impact.records?.patched?.forEach((_, recordId) => touched.add(recordId))
  impact.records?.titleChanged?.forEach(recordId => touched.add(recordId))
  return touched
}

export const collectTouchedViewIds = (
  impact: CommitImpact
): ReadonlySet<ViewId> | 'all' => {
  if (impact.reset) {
    return 'all'
  }

  if (impact.views?.touched) {
    return impact.views.touched
  }

  if (
    !impact.views?.inserted?.size
    && !impact.views?.removed?.size
    && !impact.views?.changed?.size
  ) {
    return EMPTY_VIEW_IDS
  }

  const touched = new Set<ViewId>()
  impact.views?.inserted?.forEach(viewId => touched.add(viewId))
  impact.views?.removed?.forEach(viewId => touched.add(viewId))
  impact.views?.changed?.forEach((_, viewId) => touched.add(viewId))
  return touched
}

export const hasRecordSetChange = (
  impact: CommitImpact
): boolean => Boolean(
  impact.reset
  || impact.records?.recordSetChanged
)

export const summarizeCommitImpact = (
  impact: CommitImpact
): CommitSummary => ({
  records: Boolean(
    impact.reset
    || impact.records?.inserted
    || impact.records?.removed
    || impact.records?.patched
    || impact.records?.titleChanged
    || impact.records?.valueChangedFields
  ),
  fields: Boolean(
    impact.reset
    || impact.fields?.inserted
    || impact.fields?.removed
    || impact.fields?.schema
  ),
  views: Boolean(
    impact.reset
    || impact.views?.inserted
    || impact.views?.removed
    || impact.views?.changed
  ),
  activeView: hasActiveViewImpact(impact),
  external: Boolean(impact.external?.versionBumped)
})

export const touchedRecordCountOfImpact = (
  impact: CommitImpact
): number | 'all' | undefined => {
  const touched = collectTouchedRecordIds(impact)
  return touched === 'all'
    ? 'all'
    : touched.size || undefined
}

export const touchedFieldCountOfImpact = (
  impact: CommitImpact
): number | 'all' | undefined => {
  const touched = collectTouchedFieldIds(impact, {
    includeTitlePatch: true
  })
  return touched === 'all'
    ? 'all'
    : touched.size || undefined
}

export const touchedViewCountOfImpact = (
  impact: CommitImpact
): number | 'all' | undefined => {
  const touched = collectTouchedViewIds(impact)
  return touched === 'all'
    ? 'all'
    : touched.size || undefined
}

export const hasFieldSchemaAspect = (
  impact: CommitImpact,
  fieldId: FieldId,
  aspect?: FieldSchemaAspect
): boolean => {
  if (impact.reset) {
    return true
  }

  const aspects = impact.fields?.schema?.get(fieldId)
  if (!aspects?.size) {
    return false
  }

  return aspect
    ? aspects.has('all') || aspects.has(aspect)
    : true
}
