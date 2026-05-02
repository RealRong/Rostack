import type {
  FilterRule,
  SortRule,
  View
} from '@dataview/core/types'
import {
  view as viewApi
} from '@dataview/core/view'
import {
  equal,
  json
} from '@shared/core'
import type {
  DataviewMutationPorts,
  DataviewViewPatch
} from '../program'
import {
  readViewDisplayFieldIds
} from '../../view/display'
import {
  readViewOrderIds
} from '../../view/order'

const insertBefore = <T,>(
  items: readonly T[],
  value: T,
  before?: T
): readonly T[] => {
  const next = items.filter((entry) => entry !== value)
  if (before === undefined) {
    return [...next, value]
  }

  const index = next.indexOf(before)
  if (index < 0) {
    return [...next, value]
  }

  return [
    ...next.slice(0, index),
    value,
    ...next.slice(index)
  ]
}

const toBeforeAnchor = (
  before?: string
) => before === undefined
  ? undefined
  : {
      kind: 'before' as const,
      itemId: before
    }

const cloneFilterValue = (
  value: FilterRule['value']
): FilterRule['value'] => {
  if (
    typeof value === 'object'
    && value !== null
    && 'kind' in value
    && value.kind === 'option-set'
  ) {
    return {
      kind: 'option-set',
      optionIds: [...value.optionIds]
    }
  }

  return structuredClone(value)
}

const cloneFilterRule = (
  rule: FilterRule
): FilterRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  presetId: rule.presetId,
  ...(Object.prototype.hasOwnProperty.call(rule, 'value')
    ? {
        value: cloneFilterValue(rule.value)
      }
    : {})
})

const cloneSortRule = (
  rule: SortRule
): SortRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  direction: rule.direction
})

const sameViewOptions = (
  current: View,
  next: View
): boolean => {
  if (current.type !== next.type) {
    return false
  }

  switch (current.type) {
    case 'table':
      return next.type === 'table'
        ? viewApi.options.same('table', current.options, next.options)
        : false
    case 'gallery':
      return next.type === 'gallery'
        ? viewApi.options.same('gallery', current.options, next.options)
        : false
    case 'kanban':
      return next.type === 'kanban'
        ? viewApi.options.same('kanban', current.options, next.options)
        : false
  }
}

const writeViewFilter = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  if (!equal.sameJsonValue(current.filter, next.filter)) {
    writer.view.patch(current.id, {
      filter: {
        mode: next.filter.mode,
        rules: {
          ids: [...next.filter.rules.ids],
          byId: Object.fromEntries(next.filter.rules.ids.flatMap((ruleId) => {
            const rule = next.filter.rules.byId[ruleId]
            return rule
              ? [[ruleId, cloneFilterRule(rule)]]
              : []
          }))
        }
      }
    })
  }
}

const writeViewSort = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  if (!equal.sameJsonValue(current.sort, next.sort)) {
    writer.view.patch(current.id, {
      sort: {
        rules: {
          ids: [...next.sort.rules.ids],
          byId: Object.fromEntries(next.sort.rules.ids.flatMap((ruleId) => {
            const rule = next.sort.rules.byId[ruleId]
            return rule
              ? [[ruleId, cloneSortRule(rule)]]
              : []
          }))
        }
      }
    })
  }
}

const writeViewDisplay = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  let working = [...readViewDisplayFieldIds(current.display)]
  const nextFields = readViewDisplayFieldIds(next.display)
  const nextFieldSet = new Set(nextFields)

  readViewDisplayFieldIds(current.display).forEach((fieldId) => {
    if (nextFieldSet.has(fieldId)) {
      return
    }

    writer.viewDisplay(current.id).delete(fieldId)
    working = working.filter((entry) => entry !== fieldId)
  })

  for (let index = nextFields.length - 1; index >= 0; index -= 1) {
    const fieldId = nextFields[index]!
    const before = nextFields[index + 1]
    if (!working.includes(fieldId)) {
      writer.viewDisplay(current.id).insert(
        fieldId,
        toBeforeAnchor(before)
      )
      working = [...insertBefore(working, fieldId, before)]
      continue
    }

    const reordered = insertBefore(working, fieldId, before)
    if (equal.sameOrder(working, reordered)) {
      continue
    }

    writer.viewDisplay(current.id).move(
      fieldId,
      toBeforeAnchor(before)
    )
    working = [...reordered]
  }
}

const writeViewOrder = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  let working = [...readViewOrderIds(current)]
  const nextOrder = readViewOrderIds(next)
  const nextRecordSet = new Set(nextOrder)

  readViewOrderIds(current).forEach((recordId) => {
    if (nextRecordSet.has(recordId)) {
      return
    }

    writer.viewOrder(current.id).delete(recordId)
    working = working.filter((entry) => entry !== recordId)
  })

  for (let index = nextOrder.length - 1; index >= 0; index -= 1) {
    const recordId = nextOrder[index]!
    const before = nextOrder[index + 1]
    if (!working.includes(recordId)) {
      writer.viewOrder(current.id).insert(
        recordId,
        toBeforeAnchor(before)
      )
      working = [...insertBefore(working, recordId, before)]
      continue
    }

    const reordered = insertBefore(working, recordId, before)
    if (equal.sameOrder(working, reordered)) {
      continue
    }

    writer.viewOrder(current.id).move(
      recordId,
      toBeforeAnchor(before)
    )
    working = [...reordered]
  }
}

export const writeViewUpdate = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  const patch: DataviewViewPatch = {}

  if (current.name !== next.name) {
    patch.name = next.name
  }
  if (current.type !== next.type) {
    patch.type = next.type
  }
  if (!viewApi.search.state.same(current.search, next.search)) {
    patch.search = viewApi.search.state.clone(next.search)
  }
  if (!viewApi.group.state.same(current.group, next.group)) {
    patch.group = current.group && next.group
      ? json.diff(current.group, next.group) as DataviewViewPatch['group']
      : next.group
        ? viewApi.group.state.clone(next.group)!
        : undefined
  }
  if (!viewApi.calc.same(current.calc, next.calc)) {
    patch.calc = structuredClone(next.calc)
  }
  if (!sameViewOptions(current, next)) {
    patch.options = structuredClone(next.options)
  }
  if (current.filter.mode !== next.filter.mode) {
    patch.filter = {
      ...structuredClone(current.filter),
      mode: next.filter.mode
    }
  }

  if (Object.keys(patch).length) {
    writer.view.patch(current.id, patch)
  }

  writeViewFilter(writer, current, next)
  writeViewSort(writer, current, next)
  writeViewDisplay(writer, current, next)
  writeViewOrder(writer, current, next)
}
