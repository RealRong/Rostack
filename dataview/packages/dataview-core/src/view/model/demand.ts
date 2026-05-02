import type {
  FieldId,
  View
} from '@dataview/core/types'
import { collection } from '@shared/core'
import { filter } from '@dataview/core/view'
import { sort } from '@dataview/core/view'
import { readViewFieldIds } from '@dataview/core/view/fields'

export const viewSearchFields = (
  view: View
): ReadonlySet<FieldId> | 'all' => (
  collection.presentSet(view.search.fields)
    ?? 'all'
)

export const viewFilterFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  filter.rules.read.list(view.filter.rules).map(rule => rule.fieldId)
)

export const viewSortFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  sort.rules.read.list(view.sort.rules).map(rule => rule.fieldId)
)

export const viewCalcFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  Object.entries(view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
)

export const viewVisibleFields = (
  view: View
): ReadonlySet<FieldId> => new Set(readViewFieldIds(view))
