import type {
  BucketState,
  FieldId,
  FilterRule,
  SortRule,
  View,
  ViewCalc,
  ViewFilterRuleId,
  ViewGroupBucketId,
  ViewSortRuleId
} from '@dataview/core/types'
import type {
  DocumentOperation
} from '@dataview/core/op'
import {
  view as viewApi
} from '@dataview/core/view'
import {
  equal,
  order
} from '@shared/core'

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

export const buildViewDisplayOps = (
  current: View,
  next: View
): DocumentOperation[] => {
  if (equal.sameOrder(current.display.fields, next.display.fields)) {
    return []
  }

  const operations: DocumentOperation[] = []
  let working = [...current.display.fields]
  const nextFieldSet = new Set(next.display.fields)

  current.display.fields.forEach((fieldId) => {
    if (nextFieldSet.has(fieldId)) {
      return
    }

    operations.push({
      type: 'view.display.hide',
      id: current.id,
      field: fieldId
    })
    working = working.filter((entry) => entry !== fieldId)
  })

  for (let index = next.display.fields.length - 1; index >= 0; index -= 1) {
    const fieldId = next.display.fields[index]!
    const before = next.display.fields[index + 1]
    if (!working.includes(fieldId)) {
      operations.push({
        type: 'view.display.show',
        id: current.id,
        field: fieldId,
        ...(before !== undefined
          ? { before }
          : {})
      })
      working = order.moveItem(working, fieldId, {
        ...(before !== undefined
          ? { before }
          : {})
      })
      continue
    }

    const reordered = order.moveItem(working, fieldId, {
      ...(before !== undefined
        ? { before }
        : {})
    })
    if (equal.sameOrder(working, reordered)) {
      continue
    }

    operations.push({
      type: 'view.display.move',
      id: current.id,
      field: fieldId,
      ...(before !== undefined
        ? { before }
        : {})
    })
    working = reordered
  }

  return operations
}

const buildViewFilterOps = (
  current: View,
  next: View
): DocumentOperation[] => {
  const operations: DocumentOperation[] = []

  if (current.filter.mode !== next.filter.mode) {
    operations.push({
      type: 'view.filter.mode.set',
      id: current.id,
      mode: next.filter.mode
    })
  }

  let workingIds = [...current.filter.rules.ids]
  const nextSet = new Set(next.filter.rules.ids)

  current.filter.rules.ids.forEach((ruleId) => {
    if (nextSet.has(ruleId)) {
      return
    }

    operations.push({
      type: 'view.filter.remove',
      id: current.id,
      rule: ruleId
    })
    workingIds = workingIds.filter((entry) => entry !== ruleId)
  })

  for (let index = next.filter.rules.ids.length - 1; index >= 0; index -= 1) {
    const ruleId = next.filter.rules.ids[index]!
    const before = next.filter.rules.ids[index + 1]
    const nextRule = next.filter.rules.byId[ruleId] as FilterRule
    const currentRule = current.filter.rules.byId[ruleId]

    if (!workingIds.includes(ruleId)) {
      operations.push({
        type: 'view.filter.create',
        id: current.id,
        rule: structuredClone(nextRule),
        ...(before !== undefined
          ? { before }
          : {})
      })
      workingIds = insertBefore(workingIds, ruleId, before)
      continue
    }

    if (!currentRule || !viewApi.filter.rule.same(currentRule, nextRule)) {
      operations.push({
        type: 'view.filter.patch',
        id: current.id,
        rule: ruleId,
        patch: {
          fieldId: nextRule.fieldId,
          presetId: nextRule.presetId,
          ...(Object.prototype.hasOwnProperty.call(nextRule, 'value')
            ? { value: structuredClone(nextRule.value) }
            : {})
        }
      })
    }

    const reordered = insertBefore(workingIds, ruleId, before)
    if (!equal.sameOrder(workingIds, reordered)) {
      operations.push({
        type: 'view.filter.move',
        id: current.id,
        rule: ruleId,
        ...(before !== undefined
          ? { before }
          : {})
      })
      workingIds = [...reordered]
    }
  }

  return operations
}

const buildViewSortOps = (
  current: View,
  next: View
): DocumentOperation[] => {
  const operations: DocumentOperation[] = []
  let workingIds = [...current.sort.rules.ids]
  const nextSet = new Set(next.sort.rules.ids)

  current.sort.rules.ids.forEach((ruleId) => {
    if (nextSet.has(ruleId)) {
      return
    }

    operations.push({
      type: 'view.sort.remove',
      id: current.id,
      rule: ruleId
    })
    workingIds = workingIds.filter((entry) => entry !== ruleId)
  })

  for (let index = next.sort.rules.ids.length - 1; index >= 0; index -= 1) {
    const ruleId = next.sort.rules.ids[index]!
    const before = next.sort.rules.ids[index + 1]
    const nextRule = next.sort.rules.byId[ruleId] as SortRule
    const currentRule = current.sort.rules.byId[ruleId]

    if (!workingIds.includes(ruleId)) {
      operations.push({
        type: 'view.sort.create',
        id: current.id,
        rule: structuredClone(nextRule),
        ...(before !== undefined
          ? { before }
          : {})
      })
      workingIds = insertBefore(workingIds, ruleId, before)
      continue
    }

    if (
      !currentRule
      || currentRule.fieldId !== nextRule.fieldId
      || currentRule.direction !== nextRule.direction
    ) {
      operations.push({
        type: 'view.sort.patch',
        id: current.id,
        rule: ruleId,
        patch: {
          fieldId: nextRule.fieldId,
          direction: nextRule.direction
        }
      })
    }

    const reordered = insertBefore(workingIds, ruleId, before)
    if (!equal.sameOrder(workingIds, reordered)) {
      operations.push({
        type: 'view.sort.move',
        id: current.id,
        rule: ruleId,
        ...(before !== undefined
          ? { before }
          : {})
      })
      workingIds = [...reordered]
    }
  }

  return operations
}

const readBucketState = (
  buckets: Readonly<Record<ViewGroupBucketId, BucketState>> | undefined,
  bucketId: ViewGroupBucketId
): BucketState | undefined => buckets?.[bucketId]

const buildViewGroupOps = (
  current: View,
  next: View
): DocumentOperation[] => {
  if (viewApi.group.state.same(current.group, next.group)) {
    return []
  }
  if (!next.group) {
    return current.group
      ? [{
          type: 'view.group.clear',
          id: current.id
        }]
      : []
  }
  if (!current.group || current.group.fieldId !== next.group.fieldId) {
    return [{
      type: 'view.group.set',
      id: current.id,
      group: viewApi.group.state.clone(next.group)!
    }]
  }

  const operations: DocumentOperation[] = []

  if (current.group.mode !== next.group.mode) {
    operations.push({
      type: 'view.group.mode.set',
      id: current.id,
      mode: next.group.mode
    })
  }
  if (current.group.bucketSort !== next.group.bucketSort) {
    operations.push({
      type: 'view.group.sort.set',
      id: current.id,
      sort: next.group.bucketSort
    })
  }
  if (current.group.bucketInterval !== next.group.bucketInterval) {
    operations.push({
      type: 'view.group.interval.set',
      id: current.id,
      ...(next.group.bucketInterval !== undefined
        ? { interval: next.group.bucketInterval }
        : {})
    })
  }
  if ((current.group.showEmpty ?? false) !== (next.group.showEmpty ?? false)) {
    operations.push({
      type: 'view.group.showEmpty.set',
      id: current.id,
      value: next.group.showEmpty ?? false
    })
  }

  const bucketIds = new Set<ViewGroupBucketId>([
    ...Object.keys(current.group.buckets ?? {}) as ViewGroupBucketId[],
    ...Object.keys(next.group.buckets ?? {}) as ViewGroupBucketId[]
  ])
  bucketIds.forEach((bucketId) => {
    const currentBucket = readBucketState(current.group?.buckets, bucketId)
    const nextBucket = readBucketState(next.group?.buckets, bucketId)
    const currentHidden = currentBucket?.hidden === true
    const nextHidden = nextBucket?.hidden === true
    const currentCollapsed = currentBucket?.collapsed === true
    const nextCollapsed = nextBucket?.collapsed === true

    if (currentHidden !== nextHidden) {
      operations.push({
        type: nextHidden
          ? 'view.section.hide'
          : 'view.section.show',
        id: current.id,
        bucket: bucketId
      })
    }
    if (currentCollapsed !== nextCollapsed) {
      operations.push({
        type: nextCollapsed
          ? 'view.section.collapse'
          : 'view.section.expand',
        id: current.id,
        bucket: bucketId
      })
    }
  })

  return operations
}

const buildViewCalcOps = (
  current: View,
  next: View
): DocumentOperation[] => {
  const operations: DocumentOperation[] = []
  const fieldIds = new Set<FieldId>([
    ...Object.keys(current.calc) as FieldId[],
    ...Object.keys(next.calc) as FieldId[]
  ])

  fieldIds.forEach((fieldId) => {
    const currentMetric = current.calc[fieldId]
    const nextMetric = next.calc[fieldId]
    if (currentMetric === nextMetric) {
      return
    }

    operations.push({
      type: 'view.calc.set',
      id: current.id,
      field: fieldId,
      metric: nextMetric ?? null
    })
  })

  return operations
}

const buildViewLayoutOps = (
  current: View,
  next: View
): DocumentOperation[] => {
  const operations: DocumentOperation[] = []

  if (current.type !== next.type) {
    operations.push({
      type: 'view.type.set',
      id: current.id,
      viewType: next.type
    })
  }

  switch (next.type) {
    case 'table':
      if (
        current.type !== 'table'
        || !equal.sameShallowRecord(current.type === 'table' ? current.options.widths : {}, next.options.widths)
      ) {
        operations.push({
          type: 'view.table.widths.set',
          id: current.id,
          widths: {
            ...next.options.widths
          }
        })
      }
      if (current.type !== 'table' || current.options.showVerticalLines !== next.options.showVerticalLines) {
        operations.push({
          type: 'view.table.verticalLines.set',
          id: current.id,
          value: next.options.showVerticalLines
        })
      }
      if (current.type !== 'table' || current.options.wrap !== next.options.wrap) {
        operations.push({
          type: 'view.table.wrap.set',
          id: current.id,
          value: next.options.wrap
        })
      }
      break
    case 'gallery':
      if (current.type !== 'gallery' || current.options.card.wrap !== next.options.card.wrap) {
        operations.push({
          type: 'view.gallery.wrap.set',
          id: current.id,
          value: next.options.card.wrap
        })
      }
      if (current.type !== 'gallery' || current.options.card.size !== next.options.card.size) {
        operations.push({
          type: 'view.gallery.size.set',
          id: current.id,
          value: next.options.card.size
        })
      }
      if (current.type !== 'gallery' || current.options.card.layout !== next.options.card.layout) {
        operations.push({
          type: 'view.gallery.layout.set',
          id: current.id,
          value: next.options.card.layout
        })
      }
      break
    case 'kanban':
      if (current.type !== 'kanban' || current.options.card.wrap !== next.options.card.wrap) {
        operations.push({
          type: 'view.kanban.wrap.set',
          id: current.id,
          value: next.options.card.wrap
        })
      }
      if (current.type !== 'kanban' || current.options.card.size !== next.options.card.size) {
        operations.push({
          type: 'view.kanban.size.set',
          id: current.id,
          value: next.options.card.size
        })
      }
      if (current.type !== 'kanban' || current.options.card.layout !== next.options.card.layout) {
        operations.push({
          type: 'view.kanban.layout.set',
          id: current.id,
          value: next.options.card.layout
        })
      }
      if (current.type !== 'kanban' || current.options.fillColumnColor !== next.options.fillColumnColor) {
        operations.push({
          type: 'view.kanban.fillColor.set',
          id: current.id,
          value: next.options.fillColumnColor
        })
      }
      if (current.type !== 'kanban' || current.options.cardsPerColumn !== next.options.cardsPerColumn) {
        operations.push({
          type: 'view.kanban.cardsPerColumn.set',
          id: current.id,
          value: next.options.cardsPerColumn
        })
      }
      break
  }

  return operations
}

export const buildViewUpdateOps = (
  current: View,
  next: View
): DocumentOperation[] => [
  ...(current.name !== next.name
    ? [{
        type: 'view.rename',
        id: current.id,
        name: next.name
      } satisfies DocumentOperation]
    : []),
  ...(!viewApi.search.state.same(current.search, next.search)
    ? [{
        type: 'view.search.set',
        id: current.id,
        search: viewApi.search.state.clone(next.search)
      } satisfies DocumentOperation]
    : []),
  ...buildViewFilterOps(current, next),
  ...buildViewSortOps(current, next),
  ...buildViewCalcOps(current, next),
  ...buildViewLayoutOps(current, next),
  ...buildViewGroupOps(current, next),
  ...buildViewDisplayOps(current, next)
]
