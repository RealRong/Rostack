import {
  createValueStore
} from '@shared/store'
import type {
  AppearanceId
} from '@dataview/engine/project'
import type {
  Selection,
  SelectionStore
} from './types'

const emptyIds = [] as readonly AppearanceId[]

export const emptySelection: Selection = {
  ids: emptyIds
}

type SelectMode = 'replace' | 'toggle' | 'range'

const sameIds = (
  left: readonly AppearanceId[],
  right: readonly AppearanceId[]
) => (
  left.length === right.length
  && left.every((id, index) => id === right[index])
)

const includesId = (
  ids: readonly AppearanceId[],
  id: AppearanceId | undefined
): id is AppearanceId => {
  if (!id) {
    return false
  }

  return ids.includes(id)
}

const createSelection = (
  ids: readonly AppearanceId[],
  input?: {
    anchor?: AppearanceId
    focus?: AppearanceId
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
  order: readonly AppearanceId[],
  current: Selection
) => (
  current.anchor && order.includes(current.anchor)
    ? current.anchor
    : current.focus && order.includes(current.focus)
      ? current.focus
      : current.ids.find(id => order.includes(id))
)

const reconcileSelection = (
  ids: readonly AppearanceId[],
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
    left.anchor === right.anchor
    && left.focus === right.focus
    && sameIds(left.ids, right.ids)
  ),
  normalize: (
    order: readonly AppearanceId[],
    ids: readonly AppearanceId[]
  ) => {
    if (!ids.length) {
      return emptyIds
    }

    const idSet = new Set(ids)
    return order.filter(id => idSet.has(id))
  },
  set: (
    order: readonly AppearanceId[],
    ids: readonly AppearanceId[],
    options?: {
      anchor?: AppearanceId
      focus?: AppearanceId
    }
  ): Selection => {
    const nextIds = selection.normalize(order, ids)
    return createSelection(nextIds, options)
  },
  toggle: (
    order: readonly AppearanceId[],
    current: Selection,
    ids: readonly AppearanceId[]
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
    order: readonly AppearanceId[],
    current: Selection,
    to: AppearanceId
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

    const start = Math.min(anchorIndex, focusIndex)
    const end = Math.max(anchorIndex, focusIndex)
    return createSelection(
      order.slice(start, end + 1),
      {
        anchor,
        focus: to
      }
    )
  },
  apply: (
    order: readonly AppearanceId[],
    current: Selection,
    ids: readonly AppearanceId[],
    mode: SelectMode,
    options?: {
      anchor?: AppearanceId
      focus?: AppearanceId
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
    order: readonly AppearanceId[],
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
    const currentIndex = order.indexOf(currentId)
    if (currentIndex === -1) {
      return undefined
    }

    const nextId = order[currentIndex + delta]
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
    order: readonly AppearanceId[]
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
  ids: readonly AppearanceId[]
) => {
  const next = reconcileSelection(ids, store.get())
  if (selection.equal(store.get(), next)) {
    return
  }

  store.set(next)
}
