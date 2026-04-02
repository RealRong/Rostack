import type { RefObject } from 'react'
import { idsInRect } from '@dataview/dom/geometry'
import { useMarquee } from '@dataview/react/interaction/useMarquee'
import {
  type AppearanceId,
  type Selection
} from '@dataview/react/currentView'
import {
  selection as currentViewSelection
} from '@dataview/react/currentView/selection'
import { type GalleryLayout } from '../reorder'

interface Options {
  containerRef: RefObject<HTMLElement | null>
  cardOrder: readonly AppearanceId[]
  disabled?: boolean
  canStart?: Parameters<typeof useMarquee<HTMLElement>>[0]['canStart']
  getLayout: () => GalleryLayout | null
  currentSelection: Selection
  commitSelection: (
    ids: readonly AppearanceId[],
    mode: 'replace' | 'toggle'
  ) => void
  setMarquee: (ids: readonly AppearanceId[]) => void
  clearMarquee: () => void
}

export const useMarqueeSelection = (options: Options) => {
  const hitIds = (
    box: Parameters<NonNullable<Parameters<typeof useMarquee<HTMLElement>>[0]['onStart']>>[0]['box'] | null
  ) => idsInRect(
    options.cardOrder,
    options.getLayout()?.cards ?? [],
    box
  )

  const nextSelection = (
    ids: readonly AppearanceId[],
    mode: 'replace' | 'toggle'
  ) => mode === 'toggle'
    ? currentViewSelection.toggle(options.cardOrder, options.currentSelection, ids)
    : currentViewSelection.set(options.cardOrder, ids)

  return useMarquee({
    containerRef: options.containerRef,
    disabled: options.disabled,
    autoPan: true,
    canStart: options.canStart,
    onStart: session => {
      const ids = hitIds(session.box)
      options.setMarquee(nextSelection(ids, session.metaKey || session.ctrlKey ? 'toggle' : 'replace').ids)
    },
    onChange: session => {
      const ids = hitIds(session.box)
      options.setMarquee(nextSelection(ids, session.metaKey || session.ctrlKey ? 'toggle' : 'replace').ids)
    },
    onEnd: session => {
      if (!session) {
        options.clearMarquee()
        return
      }

      const ids = hitIds(session.box)
      options.clearMarquee()
      options.commitSelection(
        ids,
        session.metaKey || session.ctrlKey ? 'toggle' : 'replace'
      )
    }
  })
}
