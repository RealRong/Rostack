import type {
  FieldId,
  View
} from '#core/contracts/index'

export const viewSearchFields = (
  view: View
): ReadonlySet<FieldId> | 'all' => (
  view.search.fields?.length
    ? new Set(view.search.fields)
    : 'all'
)

export const viewFilterFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.filter.rules.map(rule => rule.fieldId))

export const viewSortFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.sort.map(sorter => sorter.field))

export const viewCalcFields = (
  view: View
): ReadonlySet<FieldId> => new Set(
  Object.entries(view.calc)
    .flatMap(([fieldId, metric]) => metric ? [fieldId as FieldId] : [])
)

export const viewDisplayFields = (
  view: View
): ReadonlySet<FieldId> => new Set(view.display.fields)

export const viewSortDemandFields = (
  view: View
): readonly FieldId[] => Array.from(new Set([
  ...view.display.fields,
  ...view.sort.map(sorter => sorter.field)
]))
