import {
  useEffect,
  useMemo,
  useState,
  type RefObject
} from 'react'
import { idsInRect } from '@dataview/dom/geometry'
import { useMarquee } from '@dataview/react/interaction/useMarquee'
import { useStoreValue } from '@dataview/react/store'
import {
  type AppearanceId,
  type CurrentView,
  type Selection
} from '@dataview/react/currentView'
import {
  selection as currentViewSelection
} from '@dataview/react/currentView/selection'
import { type BoardLayout } from '../drag'

interface Options {
  currentView: CurrentView
  containerRef: RefObject<HTMLElement | null>
  cardOrder: readonly AppearanceId[]
  disabled?: boolean
  canStart?: Parameters<typeof useMarquee<HTMLElement>>[0]['canStart']
  getLayout: () => BoardLayout | null
}

export const useSelection = (options: Options) => {
  const selection = useStoreValue(options.currentView.selection)
  const [marqueeIds, setMarqueeIds] = useState<readonly AppearanceId[]>([])
  const selectedIdSet = useMemo(
    () => new Set(selection.ids),
    [selection.ids]
  )
  const marqueeIdSet = useMemo(
    () => new Set(marqueeIds),
    [marqueeIds]
  )

  useEffect(() => {
    setMarqueeIds(current => currentViewSelection.normalize(options.cardOrder, current))
  }, [options.cardOrder])

  const hitIds = (
    box: Parameters<NonNullable<Parameters<typeof useMarquee<HTMLElement>>[0]['onStart']>>[0]['box'] | null
  ) => idsInRect(
    options.cardOrder,
    options.getLayout()?.columns.flatMap(column => column.cards) ?? [],
    box
  )

  const nextSelection = (
    ids: readonly AppearanceId[],
    mode: 'replace' | 'toggle'
  ): Selection => mode === 'toggle'
    ? currentViewSelection.toggle(options.cardOrder, selection, ids)
    : currentViewSelection.set(options.cardOrder, ids)

  const marquee = useMarquee({
    containerRef: options.containerRef,
    disabled: options.disabled,
    autoPan: true,
    canStart: options.canStart,
    onStart: session => {
      setMarqueeIds(
        nextSelection(
          hitIds(session.box),
          session.metaKey || session.ctrlKey ? 'toggle' : 'replace'
        ).ids
      )
    },
    onChange: session => {
      setMarqueeIds(
        nextSelection(
          hitIds(session.box),
          session.metaKey || session.ctrlKey ? 'toggle' : 'replace'
        ).ids
      )
    },
    onEnd: session => {
      if (!session) {
        setMarqueeIds([])
        return
      }

      const ids = hitIds(session.box)
      setMarqueeIds([])
      if (session.metaKey || session.ctrlKey) {
        options.currentView.commands.selection.toggle(ids)
        return
      }

      options.currentView.commands.selection.set(ids)
    }
  })

  const select = (id: AppearanceId, mode: 'replace' | 'toggle' = 'replace') => {
    if (mode === 'toggle') {
      options.currentView.commands.selection.toggle([id])
      return
    }

    options.currentView.commands.selection.set([id])
  }

  return {
    selection,
    selectedIds: selection.ids,
    selectedIdSet,
    marqueeIdSet,
    marquee,
    select
  }
}
