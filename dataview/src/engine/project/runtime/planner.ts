import type {
  CommitDelta,
  DataDoc,
  FieldId,
  RecordPatchAspect,
  View,
  ViewId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import type {
  IndexState
} from '../index/types'
import type {
  ProjectState
} from './state'

export type StageAction =
  | 'reuse'
  | 'recompute'
  | 'reconcile'
  | 'rebuild'

export interface ProjectPlan {
  view: StageAction
  search: StageAction
  filter: StageAction
  sort: StageAction
  group: StageAction
  records: StageAction
  sections: StageAction
  appearances: StageAction
  fields: StageAction
  calculations: StageAction
}

const ACTION_PRIORITY: Record<StageAction, number> = {
  reuse: 0,
  recompute: 1,
  reconcile: 2,
  rebuild: 3
}

const createPlan = (): ProjectPlan => ({
  view: 'reuse',
  search: 'reuse',
  filter: 'reuse',
  sort: 'reuse',
  group: 'reuse',
  records: 'reuse',
  sections: 'reuse',
  appearances: 'reuse',
  fields: 'reuse',
  calculations: 'reuse'
})

const setAction = (
  plan: ProjectPlan,
  stage: keyof ProjectPlan,
  action: StageAction
) => {
  if (ACTION_PRIORITY[action] <= ACTION_PRIORITY[plan[stage]]) {
    return
  }

  plan[stage] = action
}

const bumpRecords = (
  plan: ProjectPlan
) => {
  setAction(plan, 'records', 'recompute')
  setAction(plan, 'sections', 'recompute')
  setAction(plan, 'appearances', 'recompute')
  setAction(plan, 'calculations', 'recompute')
}

const bumpSections = (
  plan: ProjectPlan
) => {
  setAction(plan, 'sections', 'recompute')
  setAction(plan, 'appearances', 'recompute')
  setAction(plan, 'calculations', 'recompute')
}

const rebuildAll = (): ProjectPlan => ({
  view: 'rebuild',
  search: 'rebuild',
  filter: 'rebuild',
  sort: 'rebuild',
  group: 'rebuild',
  records: 'rebuild',
  sections: 'rebuild',
  appearances: 'rebuild',
  fields: 'rebuild',
  calculations: 'rebuild'
})

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
): ReadonlySet<FieldId> => new Set(Object.keys(view.calc) as FieldId[])

const viewDisplayFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.display.fields)

const queryUsesChangedFields = (
  fields: ReadonlySet<FieldId> | 'all',
  changedFields: ReadonlySet<FieldId>
) => fields === 'all'
  ? changedFields.size > 0
  : hasIntersection(fields, changedFields)

const queryUsesRecordPatch = (
  view: View,
  aspects: readonly RecordPatchAspect[]
) => {
  if (!view.search.query.trim()) {
    return false
  }

  const searchFields = viewSearchFields(view)
  if (searchFields === 'all') {
    return aspects.length > 0
  }

  return aspects.includes('title') && searchFields.has(TITLE_FIELD_ID)
}

const valueFieldsOf = (
  delta: CommitDelta
): ReadonlySet<FieldId> | 'all' => {
  if (delta.entities.values?.fields === 'all') {
    return 'all'
  }

  return new Set(delta.entities.values?.fields ?? [])
}

export const buildProjectPlan = (input: {
  document: DataDoc
  activeViewId?: ViewId
  delta: CommitDelta
  project: ProjectState
  index: IndexState
}): ProjectPlan => {
  if (
    input.delta.semantics.some(item => item.kind === 'activeView.set')
    || input.project.view?.id !== input.activeViewId
  ) {
    return rebuildAll()
  }

  const activeView = input.activeViewId
    ? getDocumentViewById(input.document, input.activeViewId)
    : undefined
  if (!activeView) {
    return rebuildAll()
  }

  const plan = createPlan()
  const searchFields = viewSearchFields(activeView)
  const filterFields = viewFilterFields(activeView)
  const sortFields = viewSortFields(activeView)
  const calcFields = viewCalcFields(activeView)
  const displayFields = viewDisplayFields(activeView)
  const groupField = activeView.group?.field

  for (const item of input.delta.semantics) {
    switch (item.kind) {
      case 'activeView.set':
        return rebuildAll()
      case 'view.query': {
        if (item.viewId !== input.activeViewId) {
          break
        }

        if (item.aspects.includes('search')) {
          setAction(plan, 'search', 'recompute')
          bumpRecords(plan)
        }
        if (item.aspects.includes('filter')) {
          setAction(plan, 'filter', 'recompute')
          bumpRecords(plan)
        }
        if (item.aspects.includes('sort')) {
          setAction(plan, 'sort', 'recompute')
          bumpRecords(plan)
        }
        if (item.aspects.includes('group')) {
          setAction(plan, 'group', 'recompute')
          bumpSections(plan)
        }
        if (item.aspects.includes('order')) {
          bumpRecords(plan)
        }
        break
      }
      case 'view.layout': {
        if (item.viewId !== input.activeViewId) {
          break
        }

        if (item.aspects.includes('name') || item.aspects.includes('type')) {
          setAction(plan, 'view', 'recompute')
        }
        if (item.aspects.includes('display')) {
          setAction(plan, 'fields', 'recompute')
        }
        break
      }
      case 'view.calculations': {
        if (item.viewId !== input.activeViewId) {
          break
        }

        setAction(plan, 'calculations', 'recompute')
        break
      }
      case 'field.schema': {
        const changedField = item.fieldId
        if (displayFields.has(changedField)) {
          setAction(plan, 'fields', 'recompute')
        }
        if (activeView.search.query.trim() && queryUsesChangedFields(searchFields, new Set([changedField]))) {
          bumpRecords(plan)
        }
        if (filterFields.has(changedField)) {
          setAction(plan, 'filter', 'recompute')
          bumpRecords(plan)
        }
        if (sortFields.has(changedField)) {
          setAction(plan, 'sort', 'recompute')
          bumpRecords(plan)
        }
        if (groupField === changedField) {
          setAction(plan, 'group', 'recompute')
          bumpSections(plan)
        }
        if (calcFields.has(changedField)) {
          setAction(plan, 'calculations', 'recompute')
        }
        break
      }
      case 'record.add':
      case 'record.remove':
        bumpRecords(plan)
        break
      case 'record.patch': {
        const changedFields = new Set<FieldId>(
          item.aspects.includes('title')
            ? [TITLE_FIELD_ID]
            : []
        )

        if (queryUsesRecordPatch(activeView, item.aspects)) {
          bumpRecords(plan)
        }
        if (hasIntersection(filterFields, changedFields)) {
          bumpRecords(plan)
        }
        if (hasIntersection(sortFields, changedFields)) {
          bumpRecords(plan)
        }
        if (groupField && changedFields.has(groupField)) {
          bumpSections(plan)
        }
        if (hasIntersection(calcFields, changedFields)) {
          setAction(plan, 'calculations', 'recompute')
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
            || queryUsesChangedFields(searchFields, changedFields)
          )
        ) {
          bumpRecords(plan)
        }
        if (
          changedFields === 'all'
          || hasIntersection(filterFields, changedFields)
        ) {
          bumpRecords(plan)
        }
        if (
          changedFields === 'all'
          || hasIntersection(sortFields, changedFields)
        ) {
          bumpRecords(plan)
        }
        if (
          groupField
          && (
            changedFields === 'all'
            || changedFields.has(groupField)
          )
        ) {
          bumpSections(plan)
        }
        if (
          changedFields === 'all'
          || hasIntersection(calcFields, changedFields)
        ) {
          setAction(plan, 'calculations', 'recompute')
        }
        break
      }
    }
  }

  return plan
}
