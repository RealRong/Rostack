import {
  useEffect,
  useMemo,
  type RefObject
} from 'react'
import { idsInRect, type Box } from '@dataview/dom/geometry'
import {
  type AppearanceId,
  type CurrentView
} from '@dataview/react/runtime/currentView'
import {
  useDataView,
  useSelection as useDataViewSelection
} from '@dataview/react/dataview'
import { useStoreSelector } from '@dataview/react/dataview/storeSelector'
import { type BoardLayout } from '../drag'

interface Options {
  currentView: CurrentView
  containerRef: RefObject<HTMLElement | null>
  cardOrder: readonly AppearanceId[]
  disabled?: boolean
  canStart?: (event: PointerEvent) => boolean
  getLayout: () => BoardLayout | null
}

export const useSelection = (options: Options) => {
  const dataView = useDataView()
  const selection = useDataViewSelection()
  const selectedIdSet = useMemo(
    () => new Set(selection.ids),
    [selection.ids]
  )
  const marqueeBox = useStoreSelector(
    dataView.marquee.store,
    session => session?.ownerViewId === options.currentView.view.id
      ? session.box
      : null
  )

  useEffect(() => {
    return dataView.marquee.registerAdapter({
      viewId: options.currentView.view.id,
      containerRef: options.containerRef,
      disabled: options.disabled,
      canStart: options.canStart ?? (() => true),
      resolveIds: (box: Box) => idsInRect(
        options.cardOrder,
        options.getLayout()?.columns.flatMap(column => column.cards) ?? [],
        box
      ),
      order: () => options.cardOrder
    })
  }, [
    dataView.marquee,
    options.canStart,
    options.cardOrder,
    options.containerRef,
    options.currentView.view.id,
    options.disabled,
    options.getLayout
  ])

  const select = (id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      dataView.selection.toggle([id])
      return
    }

    dataView.selection.set([id])
  }

  return {
    selection,
    selectedIds: selection.ids,
    selectedIdSet,
    marqueeBox,
    select
  }
}
