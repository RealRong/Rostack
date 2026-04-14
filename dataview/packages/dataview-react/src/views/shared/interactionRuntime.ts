import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'
import type {
  ViewId
} from '@dataview/core/contracts'
import type {
  ItemId
} from '@dataview/engine'
import {
  useDataView,
  useDataViewValue
} from '@dataview/react/dataview'
import type {
  AutoPanTargets
} from '@dataview/react/interaction/autoPan'
import {
  createVisualTargetRegistry,
  type MarqueeAdapter,
  type SelectionTarget,
  type VisualTargetRegistry
} from '@dataview/react/runtime/marquee'
import { useStoreValue } from '@shared/react'
import type {
  ItemInteractionRuntime
} from '@dataview/react/views/shared/types'

export const useRegisterMarqueeAdapter = (
  adapter: MarqueeAdapter
) => {
  const dataView = useDataView()

  useEffect(
    () => dataView.marquee.registerAdapter(adapter),
    [adapter, dataView.marquee]
  )
}

export const useItemSelectionRuntime = (): ItemInteractionRuntime['selection'] => {
  const dataView = useDataView()
  const selectionState = useDataViewValue(
    current => current.selection.store
  )

  const selectedIdSet = useMemo<ReadonlySet<ItemId>>(
    () => new Set(selectionState.ids),
    [selectionState.ids]
  )

  const select = useCallback((id: ItemId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }, [dataView.selection])

  return useMemo(() => ({
    selectedIds: selectionState.ids,
    selectedIdSet,
    select
  }), [select, selectedIdSet, selectionState.ids])
}

export const useItemInteractionRuntime = (input: {
  viewId: ViewId
  itemIds: readonly ItemId[]
  disabled?: boolean
  canStart: (event: PointerEvent) => boolean
  resolveAutoPanTargets: () => AutoPanTargets | null
  getTargets?: () => readonly SelectionTarget[]
  onStart?: MarqueeAdapter['onStart']
  onEnd?: MarqueeAdapter['onEnd']
  onCancel?: MarqueeAdapter['onCancel']
}): ItemInteractionRuntime => {
  const dataView = useDataView()
  const selection = useItemSelectionRuntime()
  const visualTargets = useRef<VisualTargetRegistry>(createVisualTargetRegistry({
    resolveScrollTargets: input.resolveAutoPanTargets
  })).current
  const marqueeSession = useStoreValue(dataView.marquee.store)
  const marqueeActive = marqueeSession?.ownerViewId === input.viewId

  const adapter = useMemo<MarqueeAdapter>(() => ({
    viewId: input.viewId,
    disabled: input.disabled,
    canStart: input.canStart,
    getTargets: input.getTargets ?? (() => visualTargets.getTargets(input.itemIds)),
    order: () => input.itemIds,
    resolveAutoPanTargets: input.resolveAutoPanTargets,
    onStart: session => {
      visualTargets.clearFrozen()
      input.onStart?.(session)
    },
    onEnd: (session, currentSelection) => {
      visualTargets.clearFrozen()
      input.onEnd?.(session, currentSelection)
    },
    onCancel: (session, currentSelection) => {
      visualTargets.clearFrozen()
      input.onCancel?.(session, currentSelection)
    }
  }), [
    input.canStart,
    input.disabled,
    input.getTargets,
    input.itemIds,
    input.onCancel,
    input.onEnd,
    input.onStart,
    input.resolveAutoPanTargets,
    input.viewId,
    visualTargets
  ])

  useRegisterMarqueeAdapter(adapter)

  return useMemo(() => ({
    selection,
    marqueeActive,
    visualTargets
  }), [
    marqueeActive,
    selection,
    visualTargets
  ])
}

export interface ItemDragRuntime extends ItemInteractionRuntime {
  dragging: boolean
  itemMap: ReadonlyMap<ItemId, ItemId>
  getDragIds: (activeId: ItemId) => readonly ItemId[]
  onDraggingChange: (dragging: boolean) => void
}

export const useItemDragRuntime = (input: {
  viewId: ViewId
  itemIds: readonly ItemId[]
  canStart: (event: PointerEvent) => boolean
  resolveAutoPanTargets: () => AutoPanTargets | null
}): ItemDragRuntime => {
  const [dragging, setDragging] = useState(false)
  const interaction = useItemInteractionRuntime({
    ...input,
    disabled: dragging
  })
  const itemIdSet = useMemo(
    () => new Set(input.itemIds),
    [input.itemIds]
  )
  const itemMap = useMemo<ReadonlyMap<ItemId, ItemId>>(
    () => new Map(input.itemIds.map(id => [id, id] as const)),
    [input.itemIds]
  )
  const getDragIds = useCallback((activeId: ItemId) => (
    interaction.selection.selectedIdSet.has(activeId)
      ? interaction.selection.selectedIds.filter(id => itemIdSet.has(id))
      : [activeId]
  ), [
    interaction.selection.selectedIdSet,
    interaction.selection.selectedIds,
    itemIdSet
  ])

  return useMemo(() => ({
    ...interaction,
    dragging,
    itemMap,
    getDragIds,
    onDraggingChange: setDragging
  }), [
    dragging,
    getDragIds,
    interaction,
    itemMap
  ])
}
