import {
  useEffect,
  useCallback,
  useMemo,
  useState,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type PointerEventHandler
} from 'react'
import type { Point } from '@shared/dom'
import {
  fill,
  gridSelection
} from '@dataview/table'
import {
  type AppearanceList,
  type FieldList,
  type AppearanceId,
  type CellRef,
  type ViewProjection as CurrentView,
  sameCellRef
} from '@dataview/engine/projection/view'
import {
  getRecordFieldValue,
  resolveFieldPrimaryAction
} from '@dataview/core/field'
import { isOverlayBlockingElement } from '@ui/overlay'
import {
  containsRelatedTarget,
  shouldCapturePointer
} from '@shared/dom'
import { useDataView } from '@dataview/react/dataview'
import {
  resolveDefaultAutoPanTargets,
  useAutoPan
} from '@dataview/react/interaction/autoPan'
import { useStoreValue } from '@shared/react'
import type { TableHoverTarget } from '../model/hover'
import { hoveredRowIdOf } from '../model/hover'
import { useTableContext } from '../context'
import {
  cellFromPoint,
  cellFromTarget,
  closestTableTargetElement
} from '../dom/targets'
import {
  canFallbackToRowHover,
  resolveHoverTargetFromPoint
} from '../model/hoverResolver'

export interface PointerOptions {
  enabled: boolean
  onBlankPointerDown: PointerEventHandler<HTMLDivElement>
}

export interface PointerBinding {
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerLeave: PointerEventHandler<HTMLDivElement>
}

type CellIntent = 'primary' | 'set' | 'extend'

type PointerState =
  | {
      type: 'press'
      cell: CellRef
      element?: Element | null
      start: {
        x: number
        y: number
      }
      intent: CellIntent
    }
  | {
      type: 'drag'
      mode: 'pointer'
      anchor: CellRef
      lastTarget?: CellRef
    }
  | {
      type: 'drag'
      mode: 'fill'
      anchor: CellRef
      lastTarget?: CellRef
    }

type FillPointerState = Extract<PointerState, {
  type: 'drag'
  mode: 'fill'
}>

interface RowHoverContext {
  container: HTMLElement | null
  appearances: Pick<AppearanceList, 'has'>
  fields: Pick<FieldList, 'has'>
  rowIds: readonly AppearanceId[]
  rowIdAtPoint: (input: {
    rowIds: readonly AppearanceId[]
    point: Point | null
  }) => AppearanceId | null
}

const THRESHOLD = 4

const toPoint = (
  event: {
    clientX: number
    clientY: number
  }
): Point => ({
  x: event.clientX,
  y: event.clientY
})

const intentOf = (
  event: {
    shiftKey: boolean
    metaKey: boolean
    ctrlKey: boolean
  }
): CellIntent => {
  if (event.shiftKey) {
    return 'extend'
  }

  return event.metaKey || event.ctrlKey
    ? 'set'
    : 'primary'
}

const rowHoverTargetFromElement = (
  target: EventTarget | null
): TableHoverTarget | null => {
  const rowElement = (
    closestTableTargetElement(target, 'row')
    ?? closestTableTargetElement(target, 'row-rail')
  )
  const rowId = (
    rowElement?.dataset.rowId
    ?? rowElement?.dataset.rowRailRowId
  ) as AppearanceId | undefined

  return rowId
    ? {
        type: 'row-rail',
        rowId
      }
    : null
}

const hoverTargetFromElement = (
  target: EventTarget | null,
  appearances: Pick<AppearanceList, 'has'>,
  fields: Pick<FieldList, 'has'>
): TableHoverTarget | null => {
  const cell = (
    cellFromTarget(target, appearances, fields, 'cell')
    ?? cellFromTarget(target, appearances, fields, 'fill-handle')
  )
  if (cell) {
    return {
      type: 'cell',
      cell
    }
  }

  return rowHoverTargetFromElement(target)
}

const rowHoverTargetFromPoint = (
  point: Point | null,
  context: RowHoverContext
): TableHoverTarget | null => {
  const rowId = context.rowIdAtPoint({
    rowIds: context.rowIds,
    point
  })

  return rowId
    ? {
        type: 'row-rail',
        rowId
      }
    : null
}

const allowsRowHoverFallback = (
  element: Element | null,
  container: HTMLElement | null | undefined
) => {
  if (!container) {
    return false
  }

  if (!element) {
    return canFallbackToRowHover({
      withinContainer: true,
      overBlockingOverlay: false,
      overGroupRow: false,
      overColumn: false
    })
  }

  return canFallbackToRowHover({
    withinContainer: container === element || container.contains(element),
    overBlockingOverlay: isOverlayBlockingElement(element),
    overGroupRow: Boolean(closestTableTargetElement(element, 'group-row')),
    overColumn: Boolean(closestTableTargetElement(element, 'column'))
  })
}

const hoverTargetFromPoint = (
  point: Point | null,
  context?: RowHoverContext
): TableHoverTarget | null => {
  if (!point || typeof document === 'undefined' || !context) {
    return null
  }

  return resolveHoverTargetFromPoint({
    point,
    elementAtPoint: nextPoint => document.elementFromPoint(nextPoint.x, nextPoint.y),
    targetFromElement: element => hoverTargetFromElement(
      element,
      context.appearances,
      context.fields
    ),
    allowsRowFallback: element => allowsRowHoverFallback(element, context.container),
    rowTargetFromPoint: nextPoint => rowHoverTargetFromPoint(nextPoint, context)
  })
}

const useHoverBinding = (input: {
  table: ReturnType<typeof useTableContext>
  currentView: CurrentView
  enabled: boolean
}) => {
  const rowIds = input.currentView.appearances.ids
  const enabledRef = useRef(input.enabled)
  const rowIdsRef = useRef(rowIds)
  const frameRef = useRef<number | undefined>(undefined)
  const pointRef = useRef<Point | null>(null)
  enabledRef.current = input.enabled
  rowIdsRef.current = rowIds

  const rowContext = useCallback((): RowHoverContext => ({
    container: input.table.dom.container(),
    appearances: input.currentView.appearances,
    fields: input.currentView.fields,
    rowIds: rowIdsRef.current,
    rowIdAtPoint: input.table.rowHit.idAtPoint
  }), [
    input.currentView.appearances,
    input.currentView.fields,
    input.table
  ])

  const cancelFrame = useCallback(() => {
    if (frameRef.current === undefined || typeof window === 'undefined') {
      return
    }

    window.cancelAnimationFrame(frameRef.current)
    frameRef.current = undefined
  }, [])

  const clear = useCallback((point?: Point | null) => {
    input.table.hover.clear(point)
  }, [input.table])

  const flushPointer = useCallback(() => {
    frameRef.current = undefined
    const point = pointRef.current
    if (!enabledRef.current) {
      clear(point)
      return
    }

    const target = hoverTargetFromPoint(point, rowContext())
    input.table.hover.set(target, point)
    input.table.rowRail.set(hoveredRowIdOf(target))
  }, [
    clear,
    input.table,
    rowContext
  ])

  const schedulePointer = useCallback(() => {
    if (typeof window === 'undefined') {
      flushPointer()
      return
    }

    if (frameRef.current !== undefined) {
      return
    }

    frameRef.current = window.requestAnimationFrame(flushPointer)
  }, [flushPointer])

  const refresh = useCallback((point?: Point | null) => {
    const resolvedPoint = point === undefined
      ? input.table.hover.point()
      : point

    if (!enabledRef.current) {
      clear(resolvedPoint)
      return
    }

    pointRef.current = resolvedPoint
    const target = hoverTargetFromPoint(resolvedPoint ?? null, rowContext())
    input.table.hover.set(target, resolvedPoint)
    input.table.rowRail.set(hoveredRowIdOf(target))
  }, [clear, input.table, rowContext])

  const onPointerMove = useCallback<PointerEventHandler<HTMLDivElement>>(event => {
    const point = {
      x: event.clientX,
      y: event.clientY
    }

    pointRef.current = point

    if (!enabledRef.current) {
      cancelFrame()
      clear(point)
      return
    }

    schedulePointer()
  }, [cancelFrame, clear, schedulePointer])

  const onPointerLeave = useCallback<PointerEventHandler<HTMLDivElement>>(event => {
    if (containsRelatedTarget({
      currentTarget: event.currentTarget,
      relatedTarget: event.relatedTarget
    })) {
      return
    }

    cancelFrame()
    pointRef.current = null
    input.table.rowRail.set(null)
    clear(null)
  }, [cancelFrame, clear, input.table.rowRail])

  useEffect(() => () => {
    cancelFrame()
    pointRef.current = null
  }, [cancelFrame])

  useEffect(() => {
    if (!input.enabled) {
      clear()
      return
    }

    refresh()
  }, [clear, input.enabled, refresh, rowIds])

  useEffect(() => {
    const pageScroll = input.table.dom.scrollRoot()
    const container = input.table.dom.container()
    const scrollTarget = pageScroll === window ? null : pageScroll
    if (typeof window === 'undefined') {
      return
    }

    const handleScroll = () => {
      refresh()
    }

    const handleBlur = () => {
      clear(null)
    }

    window.addEventListener('scroll', handleScroll, { passive: true })
    window.addEventListener('blur', handleBlur)
    scrollTarget?.addEventListener('scroll', handleScroll, { passive: true })
    container?.addEventListener('scroll', handleScroll, { passive: true })

    return () => {
      window.removeEventListener('scroll', handleScroll)
      window.removeEventListener('blur', handleBlur)
      scrollTarget?.removeEventListener('scroll', handleScroll)
      container?.removeEventListener('scroll', handleScroll)
    }
  }, [clear, input.table, refresh])

  return useMemo(() => ({
    onPointerMove,
    onPointerLeave,
    refresh
  }), [onPointerLeave, onPointerMove, refresh])
}

export const usePointer = (
  options: PointerOptions
): PointerBinding => {
  const dataView = useDataView()
  const editor = dataView.engine
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table pointer interactions require an active current view.')
  }

  const [dragActive, setDragActive] = useState(false)
  const onBlankPointerDownRef = useRef(options.onBlankPointerDown)
  const stateRef = useRef<PointerState | undefined>(undefined)
  const dragPointerRef = useRef<Point | null>(null)
  onBlankPointerDownRef.current = options.onBlankPointerDown
  const hover = useHoverBinding({
    table,
    currentView,
    enabled: options.enabled
  })

  const readGridSelection = useCallback(() => table.gridSelection.get(), [table])
  const readColumn = useCallback((fieldId: string) => (
    currentView.fields.all.find((field: { id: string }) => field.id === fieldId)
  ), [currentView.fields.all])
  const readCell = useCallback((cell: CellRef) => {
    const recordId = currentView.appearances.get(cell.appearanceId)?.recordId
    const record = recordId
      ? editor.read.record.get(recordId)
      : undefined

    return {
      exists: Boolean(record),
      value: record
        ? getRecordFieldValue(record, cell.fieldId)
        : undefined
    }
  }, [currentView.appearances, editor])

  const selectCell = useCallback((
    cell: CellRef,
    anchor: CellRef = cell
  ) => {
    table.gridSelection.set(cell, anchor)
    table.focus()
  }, [table])

  const setDragTarget = useCallback((target: CellRef | undefined) => {
    const current = stateRef.current
    if (!target || current?.type !== 'drag') {
      return
    }

    if (current.lastTarget && sameCellRef(current.lastTarget, target)) {
      return
    }

    stateRef.current = {
      ...current,
      lastTarget: target
    }
    selectCell(target, current.anchor)
  }, [selectCell])

  const refreshDragTarget = useCallback((point = dragPointerRef.current) => {
    const current = stateRef.current
    if (!point || current?.type !== 'drag') {
      return
    }

    table.hover.clear(point)
    setDragTarget(
      cellFromPoint(
        point,
        currentView.appearances,
        currentView.fields
      ) ?? undefined
    )
  }, [currentView.appearances, currentView.fields, setDragTarget, table.hover])

  const resolveAutoPanTargets = useCallback(
    () => dragActive
      ? resolveDefaultAutoPanTargets(table.layout.containerRef.current)
      : null,
    [dragActive, table.layout.containerRef]
  )
  const autoPanState = useAutoPan({
    active: dragActive,
    pointerRef: dragPointerRef,
    resolveTargets: resolveAutoPanTargets,
    onPan: refreshDragTarget
  })

  const writeCell = useCallback((
    cell: CellRef,
    value: unknown | undefined
  ) => {
    editor.view(currentView.view.id).items.writeCell(cell, value)
  }, [currentView.view.id, editor])

  const runPrimary = useCallback((
    cell: CellRef,
    intent: CellIntent,
    element?: Element | null
  ) => {
    const currentSelection = readGridSelection()
    const anchor = gridSelection.anchor(currentSelection) ?? cell
    const field = readColumn(cell.fieldId)
    const data = readCell(cell)

    if (intent === 'set' || intent === 'extend') {
      selectCell(
        cell,
        intent === 'extend' ? anchor : cell
      )
      return
    }

    const action = resolveFieldPrimaryAction({
      exists: data.exists,
      field: field,
      value: data.value
    })
    switch (action.kind) {
      case 'quickToggle':
        selectCell(cell)
        writeCell(cell, action.value)
        return
      case 'edit':
        table.openCell({
          cell,
          element
        })
        return
      case 'select':
      default:
        selectCell(cell)
    }
  }, [readCell, readColumn, readGridSelection, selectCell, table, writeCell])

  const fillSelection = useCallback((current: FillPointerState) => {
    const currentSelection = table.gridSelection.get()
    const entries = fill.plan(
      currentSelection,
      currentView.appearances,
      currentView.fields,
      readCell
    )
    if (!entries.length) {
      table.focus()
      return
    }

    entries.forEach(entry => {
      writeCell(entry.cell, entry.value)
    })
    table.focus()
  }, [
    currentView.appearances,
    currentView.fields,
    readCell,
    table,
    writeCell
  ])

  const move = useCallback((event: PointerEvent) => {
    const current = stateRef.current
    if (!current) {
      return
    }

    const point = toPoint(event)
    dragPointerRef.current = point
    table.hover.clear(point)
    const target = cellFromPoint(
      point,
      currentView.appearances,
      currentView.fields
    ) ?? undefined

    if (current.type === 'press') {
      if (
        Math.abs(point.x - current.start.x) <= THRESHOLD
        && Math.abs(point.y - current.start.y) <= THRESHOLD
      ) {
        return
      }

      const selectionState = readGridSelection()
      const anchor = current.intent === 'extend'
        ? gridSelection.anchor(selectionState) ?? current.cell
        : current.cell
      const nextTarget = target ?? current.cell

      dataView.selection.clear()
      stateRef.current = {
        type: 'drag',
        mode: 'pointer',
        anchor,
        lastTarget: undefined
      }
      setDragActive(true)
      table.interaction.setGesture('cell-select')
      setDragTarget(nextTarget)
      return
    }

    setDragTarget(target)
  }, [
    dataView.selection,
    currentView.appearances,
    currentView.fields,
    readGridSelection,
    setDragTarget,
    table
  ])

  const finish = useCallback(() => {
    const current = stateRef.current
    stateRef.current = undefined
    dragPointerRef.current = null
    setDragActive(false)

    if (!current) {
      return
    }

    if (current.type === 'press') {
      runPrimary(current.cell, current.intent, current.element)
      return
    }

    if (current.mode === 'fill') {
      fillSelection(current)
    }
  }, [fillSelection, runPrimary])

  const cancel = useCallback(() => {
    const current = stateRef.current
    stateRef.current = undefined
    dragPointerRef.current = null
    setDragActive(false)

    if (current?.type === 'drag' && current.mode === 'fill') {
      table.focus()
    }
  }, [table])

  const startPress = useCallback((
    cell: CellRef,
    event: ReactPointerEvent<HTMLDivElement>,
    element?: Element | null
  ) => {
    stateRef.current = {
      type: 'press',
      cell,
      element,
      start: toPoint(event),
      intent: intentOf(event)
    }

    dragPointerRef.current = toPoint(event)
    table.rowRail.set(null)
    table.hover.clear(dragPointerRef.current)
    const session = table.interaction.start({
      mode: 'pointer',
      gesture: 'cell-press',
      event,
      move,
      up: () => {
        finish()
      },
      cancel: () => {
        cancel()
      }
    })
    if (!session) {
      stateRef.current = undefined
      dragPointerRef.current = null
    }
  }, [cancel, finish, move, table])

  const startFill = useCallback((
    cell: CellRef,
    event: ReactPointerEvent<HTMLDivElement>
  ) => {
    stateRef.current = {
      type: 'drag',
      mode: 'fill',
      anchor: gridSelection.anchor(readGridSelection()) ?? cell,
      lastTarget: undefined
    }

    dragPointerRef.current = toPoint(event)
    setDragActive(true)
    table.rowRail.set(null)
    table.hover.clear(dragPointerRef.current)
    const session = table.interaction.start({
      mode: 'fill',
      event,
      move,
      up: () => {
        finish()
      },
      cancel: () => {
        cancel()
      }
    })
    if (!session) {
      stateRef.current = undefined
      dragPointerRef.current = null
      setDragActive(false)
    }
  }, [cancel, finish, move, readGridSelection, table])

  useEffect(() => {
    if (!dragActive || typeof window === 'undefined') {
      return
    }

    let frame = 0

    const scheduleRefresh = () => {
      if (frame) {
        return
      }

      frame = window.requestAnimationFrame(() => {
        frame = 0
        refreshDragTarget()
      })
    }

    autoPanState.watchTargets.forEach(target => {
      target.addEventListener?.('scroll', scheduleRefresh, { passive: true })
    })

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame)
      }

      autoPanState.watchTargets.forEach(target => {
        target.removeEventListener?.('scroll', scheduleRefresh)
      })
    }
  }, [autoPanState.watchTargets, dragActive, refreshDragTarget])

  const onPointerDown = useCallback<PointerEventHandler<HTMLDivElement>>(
    event => {
      if (event.button !== 0) {
        return
      }

      const fillCell = cellFromTarget(
        event.target,
        currentView.appearances,
        currentView.fields,
        'fill-handle'
      )
      if (fillCell) {
        event.preventDefault()
        startFill(fillCell, event)
        return
      }

      const cell = cellFromTarget(
        event.target,
        currentView.appearances,
        currentView.fields,
        'cell'
      )
      if (cell) {
        const cellElement = closestTableTargetElement(event.target, 'cell')
        if (!cellElement || !shouldCapturePointer(event.target, cellElement)) {
          return
        }

        event.preventDefault()
        startPress(cell, event, cellElement)
        return
      }

      onBlankPointerDownRef.current(event)
    },
    [
      currentView.appearances,
      currentView.fields,
      startFill,
      startPress
    ]
  )

  useEffect(() => () => {
    stateRef.current = undefined
    dragPointerRef.current = null
  }, [])

  return useMemo(() => ({
    onPointerDown,
    onPointerMove: hover.onPointerMove,
    onPointerLeave: hover.onPointerLeave
  }), [
    hover.onPointerLeave,
    hover.onPointerMove,
    onPointerDown
  ])
}
