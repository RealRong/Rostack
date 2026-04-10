import type {
  CommitDelta,
  DataDoc,
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import {
  TITLE_FIELD_ID
} from '@dataview/core/contracts'
import {
  getDocumentViewById
} from '@dataview/core/document'
import {
  collectSchemaFieldIds,
  collectTouchedRecordIds,
  collectValueFieldIds
} from '../../index/shared'
import type {
  ProjectionAction,
  ProjectionDelta,
  ProjectState
} from './state'
import {
  viewCalcFields,
  viewDisplayFields,
  viewFilterFields,
  viewSearchFields,
  viewSortFields
} from './demand'

const ACTION_PRIORITY: Record<ProjectionAction, number> = {
  reuse: 0,
  sync: 1,
  rebuild: 2
}

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

const queryUsesChangedFields = (
  fields: ReadonlySet<FieldId> | 'all',
  changedFields: ReadonlySet<FieldId>
) => fields === 'all'
  ? changedFields.size > 0
  : hasIntersection(fields, changedFields)

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

export const createProjectionDelta = (input: {
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
