import {
  createValueStore,
  normalizeOrderedValues,
  orderedRange,
  sameOptionalAnchorFocus,
  sameOrder
} from '@shared/core'
import {
  stepOrderedValue
} from '@shared/core'
import type {
  ItemId
} from '@dataview/engine'
import type {
  Selection,
  SelectionStore
} from '@dataview/react/runtime/selection/types'

const emptyIds = [] as readonly ItemId[]

export const emptySelection: Selection = {
  ids: emptyIds
}

type SelectMode = 'replace' | 'toggle' | 'range'

const includesId = (
  ids: readonly ItemId[],
  id: ItemId | undefined
): id is ItemId => {
  if (!id) {
    return false
  }

  return ids.includes(id)
}

const createSelection = (
  ids: readonly ItemId[],
  input?: {
    anchor?: ItemId
    focus?: ItemId
  }
): Selection => {
  if (!ids.length) {
    return emptySelection
  }

  const anchor = includesId(ids, input?.anchor)
    ? input?.anchor
    : ids[0]
  const focus = includesId(ids, input?.focus)
    ? input?.focus
    : ids[ids.length - 1]

  return {
    ids,
    ...(anchor ? { anchor } : {}),
    ...(focus ? { focus } : {})
  }
}

const currentAnchor = (
  order: readonly ItemId[],
  current: Selection
) => (
  current.anchor && order.includes(current.anchor)
    ? current.anchor
    : current.focus && order.includes(current.focus)
      ? current.focus
      : current.ids.find(id => order.includes(id))
)

const reconcileSelection = (
  ids: readonly ItemId[],
  current: Selection
): Selection => {
  const nextIds = selection.normalize(ids, current.ids)
  if (!nextIds.length) {
    return emptySelection
  }

  const anchor = current.anchor && nextIds.includes(current.anchor)
    ? current.anchor
    : nextIds[0]
  const focus = current.focus && nextIds.includes(current.focus)
    ? current.focus
    : nextIds[nextIds.length - 1]

  return {
    ids: nextIds,
    ...(anchor ? { anchor } : {}),
    ...(focus ? { focus } : {})
  }
}

export const selection = {
  equal: (
    left: Selection,
    right: Selection
  ) => (
    sameOptionalAnchorFocus(left, right)
    && sameOrder(left.ids, right.ids)
  ),
  normalize: (
    order: readonly ItemId[],
    ids: readonly ItemId[]
  ) => normalizeOrderedValues(order, ids),
  set: (
    order: readonly ItemId[],
    ids: readonly ItemId[],
    options?: {
      anchor?: ItemId
      focus?: ItemId
    }
  ): Selection => {
    const nextIds = selection.normalize(order, ids)
    return createSelection(nextIds, options)
  },
  toggle: (
    order: readonly ItemId[],
    current: Selection,
    ids: readonly ItemId[]
  ): Selection => {
    const targetIds = selection.normalize(order, ids)
    if (!targetIds.length) {
      return createSelection(
        selection.normalize(order, current.ids),
        current
      )
    }

    const toggleSet = new Set(targetIds)
    const currentSet = new Set(selection.normalize(order, current.ids))
    const nextIds = order.filter(id => (
      toggleSet.has(id)
        ? !currentSet.has(id)
        : currentSet.has(id)
    ))

    return createSelection(nextIds, current)
  },
  extend: (
    order: readonly ItemId[],
    current: Selection,
    to: ItemId
  ): Selection => {
    const focusIndex = order.indexOf(to)
    if (focusIndex === -1) {
      return createSelection(
        selection.normalize(order, current.ids),
        current
      )
    }

    const anchor = currentAnchor(order, current) ?? to
    const anchorIndex = order.indexOf(anchor)
    if (anchorIndex === -1) {
      return selection.set(order, [to])
    }

    return createSelection(
      orderedRange(order, anchor, to),
      {
        anchor,
        focus: to
      }
    )
  },
  apply: (
    order: readonly ItemId[],
    current: Selection,
    ids: readonly ItemId[],
    mode: SelectMode,
    options?: {
      anchor?: ItemId
      focus?: ItemId
    }
  ): Selection => {
    switch (mode) {
      case 'toggle':
        return selection.toggle(order, current, ids)
      case 'range': {
        const nextIds = selection.normalize(order, ids)
        const focus = options?.focus
          ?? nextIds[nextIds.length - 1]
          ?? ids[ids.length - 1]
        return focus
          ? selection.extend(order, current, focus)
          : createSelection(
              selection.normalize(order, current.ids),
              current
            )
      }
      case 'replace':
      default:
        return selection.set(order, ids, options)
    }
  },
  step: (
    order: readonly ItemId[],
    current: Selection,
    delta: number,
    options?: {
      extend?: boolean
    }
  ): Selection | undefined => {
    if (!order.length) {
      return undefined
    }

    const currentId = current.focus && order.includes(current.focus)
      ? current.focus
      : current.ids.find(id => order.includes(id))
        ?? order[0]
    const nextId = stepOrderedValue(order, currentId, delta)
    if (!nextId) {
      return undefined
    }

    return options?.extend
      ? selection.extend(order, current, nextId)
      : selection.set(order, [nextId], {
          anchor: nextId,
          focus: nextId
        })
  },
  clear: (): Selection => emptySelection,
  all: (
    order: readonly ItemId[]
  ): Selection => selection.set(order, order)
} as const

export const createSelectionStore = (
  initial: Selection = emptySelection
): SelectionStore => createValueStore<Selection>({
  initial,
  isEqual: selection.equal
})

export const syncSelection = (
  store: SelectionStore,
  ids: readonly ItemId[]
) => {
  const next = reconcileSelection(ids, store.get())
  if (selection.equal(store.get(), next)) {
    return
  }

  store.set(next)
}
