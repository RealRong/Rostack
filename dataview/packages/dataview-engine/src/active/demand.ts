import type {
  DataDoc,
  FieldId,
  ViewId
} from '@dataview/core/contracts'
import {
  createGroupDemand
} from '@dataview/engine/active/index/group/demand'
import {
  viewSortDemandFields,
} from '@dataview/core/view'
import type {
  IndexDemand
} from '@dataview/engine/active/index/contracts'
import { createStaticDocumentReader } from '@dataview/engine/document/reader'

export const resolveViewDemand = (
  document: DataDoc,
  activeViewId?: ViewId
): IndexDemand => {
  const reader = createStaticDocumentReader(document)
  const view = activeViewId
    ? reader.views.get(activeViewId)
    : undefined
  if (!view) {
    return {}
  }

  const filterGroupFields = new Set<FieldId>()
  const filterSortFields = new Set<FieldId>()
  view.filter.rules.forEach(rule => {
    const field = reader.fields.get(rule.fieldId)
    switch (field?.kind) {
      case 'status':
      case 'select':
      case 'multiSelect':
      case 'boolean':
        filterGroupFields.add(rule.fieldId)
        break
      case 'number':
      case 'date':
        filterSortFields.add(rule.fieldId)
        break
      default:
        break
    }
  })

  const search = view.search.fields?.length
    ? { fields: view.search.fields }
    : { all: true }
  const groups = view.group
    ? [
        createGroupDemand(view.group),
        ...Array.from(filterGroupFields).map(fieldId => ({ fieldId }))
      ]
    : Array.from(filterGroupFields).map(fieldId => ({ fieldId }))
  const sortFields = Array.from(new Set([
    ...viewSortDemandFields(view),
    ...filterSortFields
  ]))

  return {
    search,
    ...(groups.length ? { groups } : {}),
    ...(sortFields.length
      ? { sortFields }
      : {}),
    ...(Object.entries(view.calc).some(([, metric]) => Boolean(metric))
      ? {
          calculationFields: Object.entries(view.calc)
            .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
        }
      : {})
  }
}
