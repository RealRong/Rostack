import type {
  FieldId,
  View
} from '@dataview/core/contracts'
import { collection } from '@shared/core'
import { filter } from '@dataview/core/filter'
import { sort } from '@dataview/core/sort'

export const viewSearchFields = (
  view: View
): ReadonlySet<FieldId> | 'all' => (
  collection.presentSet(view.search.fields)
    ?? 'all'
)

export const viewFilterFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  filter.rules.list(view.filter.rules).map(rule => rule.fieldId)
)

export const viewSortFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  sort.rules.list(view.sort.rules).map(rule => rule.fieldId)
)

export const viewCalcFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  Object.entries(view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
)

export const viewDisplayFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.display.fields)
