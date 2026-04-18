import {
  useCallback,
  useEffect,
  useMemo,
  useState
} from 'react'
import type { ItemId } from '@dataview/engine'
import {
  useDataView
} from '@dataview/react/dataview'
import type {
  MarqueeMode,
  MarqueeScene
} from '@dataview/react/runtime/marquee'
import { useStoreValue } from '@shared/react'
import type {
  ItemInteractionRuntime
} from '@dataview/react/views/shared/types'

export const useRegisterMarqueeScene = (
  scene: MarqueeScene | undefined
) => {
  const dataView = useDataView()

  useEffect(() => {
    if (!scene) {
      return
    }

    return dataView.marquee.registerScene(scene)
  }, [dataView.marquee, scene])
}

export const useItemSelectionRuntime = (): ItemInteractionRuntime['selection'] => {
  const dataView = useDataView()
  const select = useCallback((id: ItemId, mode: MarqueeMode | 'replace' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.command.ids.toggle([id])
      return
    }

    if (mode === 'add') {
      dataView.selection.command.ids.add([id])
      return
    }

    dataView.selection.command.ids.replace([id], {
      anchor: id,
      focus: id
    })
  }, [dataView.selection])
  const getSelectedIds = useCallback(
    () => dataView.selection.enumerate.materialize(),
    [dataView.selection]
  )
  const isSelected = useCallback(
    (id: ItemId) => dataView.selection.query.contains(id),
    [dataView.selection]
  )

  return useMemo(() => ({
    getSelectedIds,
    isSelected,
    select
  }), [getSelectedIds, isSelected, select])
}

export const useItemInteractionRuntime = (): ItemInteractionRuntime => {
  const dataView = useDataView()
  const selection = useItemSelectionRuntime()
  const marqueeActive = useStoreValue(dataView.marquee.store) !== null

  return useMemo(() => ({
    selection,
    marqueeActive
  }), [marqueeActive, selection])
}

export interface ItemDragRuntime extends ItemInteractionRuntime {
  dragging: boolean
  itemMap: ReadonlyMap<ItemId, ItemId>
  getDragIds: (activeId: ItemId) => readonly ItemId[]
  onDraggingChange: (dragging: boolean) => void
}

export const useItemDragRuntime = (input: {
  itemIds: readonly ItemId[]
}): ItemDragRuntime => {
  const [dragging, setDragging] = useState(false)
  const interaction = useItemInteractionRuntime()
  const itemIdSet = useMemo(
    () => new Set(input.itemIds),
    [input.itemIds]
  )
  const itemMap = useMemo<ReadonlyMap<ItemId, ItemId>>(
    () => new Map(input.itemIds.map(id => [id, id] as const)),
    [input.itemIds]
  )
  const getDragIds = useCallback((activeId: ItemId) => (
    interaction.selection.isSelected(activeId)
      ? interaction.selection.getSelectedIds().filter(id => itemIdSet.has(id))
      : [activeId]
  ), [
    interaction.selection,
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
