import {
  useCallback,
  useMemo,
  useRef
} from 'react'
import type { Point } from '@dataview/dom/geometry'
import {
  type AppearanceId
} from '@dataview/react/currentView'
import {
  emptySelection,
  selection,
  type Selection,
  type SelectionApi
} from '@dataview/react/selection'
import {
  closestTarget,
  interactiveSelector
} from '@dataview/dom/interactive'
import {
  useCurrentView,
  useDataView,
  useSelection as useDataViewSelection
} from '@dataview/react/dataview'
import { useMarquee } from '@dataview/react/interaction/useMarquee'
import {
  rowMarqueeMode,
  rowMarqueeState,
  rowMarqueeSelection,
  type RowMarqueeState
} from '../model/marquee'
import { hasTableTarget } from '../dom/targets'
import { useTableContext } from '../context'

const emptyState: RowMarqueeState = {
  startEdge: null,
  currentEdge: null
}

export const startRowMarquee = (input: {
  selection: Pick<SelectionApi, 'clear'>
  currentSelection: Selection
  clearGridSelection: () => void
  clearHover: (point?: Point | null) => void
  point: Point | null
  shiftKey: boolean
  metaKey: boolean
  ctrlKey: boolean
}): Selection => {
  const baseSelection = input.currentSelection
  input.clearGridSelection()
  input.clearHover(input.point)

  if (rowMarqueeMode(input) === 'replace') {
    input.selection.clear()
  }

  return baseSelection
}

export const useRowMarquee = (disabled: boolean) => {
  const table = useTableContext()
  const dataView = useDataView()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table row marquee requires an active current view.')
  }

  const currentSelection = useDataViewSelection()
  const layout = table.layout
  const rowIds = currentView.appearances.ids
  const rowIndexById = useMemo(
    () => new Map(rowIds.map((rowId, index) => [rowId, index] as const)),
    [rowIds]
  )
  const baseSelectionRef = useRef<Selection>(emptySelection)
  const marqueeRef = useRef<RowMarqueeState>(emptyState)

  const edgeAtPoint = useCallback((point: Point | null) => {
    const hit = table.rowHit.gapAtPoint({
      rowIds,
      point
    })
    if (!hit) {
      return null
    }

    if (hit.beforeId === null) {
      return rowIds.length
    }

    return rowIndexById.get(hit.beforeId) ?? null
  }, [rowIds, rowIndexById, table.rowHit])

  const commitSelection = useCallback((input: {
    point: Point | null
    shiftKey: boolean
    metaKey: boolean
    ctrlKey: boolean
  }) => {
    marqueeRef.current = rowMarqueeState({
      previous: marqueeRef.current,
      edge: edgeAtPoint(input.point)
    })
    const next = rowMarqueeSelection({
      rowIds,
      state: marqueeRef.current
    })
    const nextSelection = rowMarqueeMode(input) === 'replace'
      ? selection.set(currentView.appearances.ids, next.ids, {
          anchor: next.anchor,
          focus: next.focus
        })
      : selection.apply(
          currentView.appearances.ids,
          baseSelectionRef.current,
          next.ids,
          rowMarqueeMode(input),
          {
            focus: next.focus
          }
        )

    dataView.selection.set(nextSelection.ids, {
      anchor: nextSelection.anchor,
      focus: nextSelection.focus
    })
  }, [currentView, dataView.selection, edgeAtPoint, rowIds])

  const marquee = useMarquee<HTMLDivElement>({
    containerRef: layout.containerRef,
    disabled,
    autoPan: true,
    canStart: event => {
      return (
        !hasTableTarget(event.target)
        && !closestTarget(event.target, interactiveSelector)
      )
    },
    onStart: session => {
      baseSelectionRef.current = startRowMarquee({
        selection: dataView.selection,
        currentSelection,
        clearGridSelection: table.gridSelection.clear,
        clearHover: table.hover.clear,
        point: session.current,
        shiftKey: session.shiftKey,
        metaKey: session.metaKey,
        ctrlKey: session.ctrlKey
      })
      marqueeRef.current = emptyState
      commitSelection({
        point: session.current,
        shiftKey: session.shiftKey,
        metaKey: session.metaKey,
        ctrlKey: session.ctrlKey
      })
    },
    onChange: session => {
      table.hover.clear(session.current)
      commitSelection({
        point: session.current,
        shiftKey: session.shiftKey,
        metaKey: session.metaKey,
        ctrlKey: session.ctrlKey
      })
    },
    onEnd: (session, meta) => {
      if (meta.cancelled) {
        dataView.selection.set(baseSelectionRef.current.ids, {
          anchor: baseSelectionRef.current.anchor,
          focus: baseSelectionRef.current.focus
        })
      } else if (session) {
        commitSelection({
          point: session.current,
          shiftKey: session.shiftKey,
          metaKey: session.metaKey,
          ctrlKey: session.ctrlKey
        })
      }

      marqueeRef.current = emptyState
      table.focus()
    }
  })

  return {
    active: marquee.active,
    box: marquee.box,
    onPointerDown: marquee.onPointerDown
  }
}
