import type {
  FieldId,
  FilterRule,
  RecordId,
  SortRule,
  View
} from '@dataview/core/types'
import {
  view as viewApi
} from '@dataview/core/view'
import {
  equal
} from '@shared/core'
import type {
  DataviewMutationPorts,
  DataviewFilterRulePatch,
  DataviewSortRulePatch,
  DataviewViewPatch
} from '../program'

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

const createFilterRulePatch = (
  current: FilterRule | undefined,
  next: FilterRule
): DataviewFilterRulePatch | undefined => {
  if (!current) {
    return undefined
  }

  const patch: DataviewFilterRulePatch = {}
  if (current.fieldId !== next.fieldId) {
    patch.fieldId = next.fieldId
  }
  if (current.presetId !== next.presetId) {
    patch.presetId = next.presetId
  }

  const hasCurrentValue = Object.prototype.hasOwnProperty.call(current, 'value')
  const hasNextValue = Object.prototype.hasOwnProperty.call(next, 'value')
  if (
    hasCurrentValue !== hasNextValue
    || (hasCurrentValue && hasNextValue && !equal.sameJsonValue(current.value, next.value))
  ) {
    patch.value = hasNextValue
      ? cloneFilterValue(next.value)
      : undefined
  }

  return Object.keys(patch).length
    ? patch
    : undefined
}

const cloneSortRule = (
  rule: SortRule
): SortRule => ({
  id: rule.id,
  fieldId: rule.fieldId,
  direction: rule.direction
})

const createSortRulePatch = (
  current: SortRule | undefined,
  next: SortRule
): DataviewSortRulePatch | undefined => {
  if (!current) {
    return undefined
  }

  const patch: DataviewSortRulePatch = {}
  if (current.fieldId !== next.fieldId) {
    patch.fieldId = next.fieldId
  }
  if (current.direction !== next.direction) {
    patch.direction = next.direction
  }

  return Object.keys(patch).length
    ? patch
    : undefined
}

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
  if (current.filter.mode !== next.filter.mode) {
    writer.view.patch(current.id, {
      filter: {
        ...structuredClone(current.filter),
        mode: next.filter.mode
      }
    })
  }

  let workingIds = [...current.filter.rules.ids]
  const nextSet = new Set(next.filter.rules.ids)

  current.filter.rules.ids.forEach((ruleId) => {
    if (nextSet.has(ruleId)) {
      return
    }

    writer.viewFilter(current.id).delete(ruleId)
    workingIds = workingIds.filter((entry) => entry !== ruleId)
  })

  for (let index = next.filter.rules.ids.length - 1; index >= 0; index -= 1) {
    const ruleId = next.filter.rules.ids[index]!
    const before = next.filter.rules.ids[index + 1]
    const nextRule = next.filter.rules.byId[ruleId] as FilterRule
    const currentRule = current.filter.rules.byId[ruleId]

    if (!workingIds.includes(ruleId)) {
      writer.viewFilter(current.id).insert(
        cloneFilterRule(nextRule),
        toBeforeAnchor(before)
      )
      workingIds = [...insertBefore(workingIds, ruleId, before)]
      continue
    }

    const patch = createFilterRulePatch(currentRule, nextRule)
    if (patch) {
      writer.viewFilter(current.id).patch(ruleId, patch)
    }

    const reordered = insertBefore(workingIds, ruleId, before)
    if (!equal.sameOrder(workingIds, reordered)) {
      writer.viewFilter(current.id).move(
        ruleId,
        toBeforeAnchor(before)
      )
      workingIds = [...reordered]
    }
  }
}

const writeViewSort = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  let workingIds = [...current.sort.rules.ids]
  const nextSet = new Set(next.sort.rules.ids)

  current.sort.rules.ids.forEach((ruleId) => {
    if (nextSet.has(ruleId)) {
      return
    }

    writer.viewSort(current.id).delete(ruleId)
    workingIds = workingIds.filter((entry) => entry !== ruleId)
  })

  for (let index = next.sort.rules.ids.length - 1; index >= 0; index -= 1) {
    const ruleId = next.sort.rules.ids[index]!
    const before = next.sort.rules.ids[index + 1]
    const nextRule = next.sort.rules.byId[ruleId] as SortRule
    const currentRule = current.sort.rules.byId[ruleId]

    if (!workingIds.includes(ruleId)) {
      writer.viewSort(current.id).insert(
        cloneSortRule(nextRule),
        toBeforeAnchor(before)
      )
      workingIds = [...insertBefore(workingIds, ruleId, before)]
      continue
    }

    const patch = createSortRulePatch(currentRule, nextRule)
    if (patch) {
      writer.viewSort(current.id).patch(ruleId, patch)
    }

    const reordered = insertBefore(workingIds, ruleId, before)
    if (!equal.sameOrder(workingIds, reordered)) {
      writer.viewSort(current.id).move(
        ruleId,
        toBeforeAnchor(before)
      )
      workingIds = [...reordered]
    }
  }
}

const writeViewDisplay = (
  writer: DataviewMutationPorts,
  current: View,
  next: View
) => {
  let working = [...current.display.fields]
  const nextFieldSet = new Set(next.display.fields)

  current.display.fields.forEach((fieldId) => {
    if (nextFieldSet.has(fieldId)) {
      return
    }

    writer.viewDisplay(current.id).delete(fieldId)
    working = working.filter((entry) => entry !== fieldId)
  })

  for (let index = next.display.fields.length - 1; index >= 0; index -= 1) {
    const fieldId = next.display.fields[index]!
    const before = next.display.fields[index + 1]
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
  let working = [...current.orders]
  const nextRecordSet = new Set(next.orders)

  current.orders.forEach((recordId) => {
    if (nextRecordSet.has(recordId)) {
      return
    }

    writer.viewOrder(current.id).delete(recordId)
    working = working.filter((entry) => entry !== recordId)
  })

  for (let index = next.orders.length - 1; index >= 0; index -= 1) {
    const recordId = next.orders[index]!
    const before = next.orders[index + 1]
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
    patch.group = next.group
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

export const writeViewDisplayInsert = (
  writer: DataviewMutationPorts,
  viewId: string,
  fieldId: FieldId,
  before?: FieldId
) => writer.viewDisplay(viewId).insert(
  fieldId,
  toBeforeAnchor(before)
)

export const writeViewOrderInsert = (
  writer: DataviewMutationPorts,
  viewId: string,
  recordId: RecordId,
  before?: RecordId
) => writer.viewOrder(viewId).insert(
  recordId,
  toBeforeAnchor(before)
)
