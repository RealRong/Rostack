import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { PropertyId } from '@/core/contracts'
import { disableUserSelect } from '@/react/dom/selection'
import { useCurrentView, useEngine } from '@/react/editor'
import { useStoreValue } from '@/react/runtime/store'
import { closestTableTargetElement } from '../dom/targets'
import { useTableContext } from '../context'
import { MIN_COLUMN_WIDTH } from '../layout'

interface ColumnWidthPreview {
  propertyId: PropertyId
  widths: ReadonlyMap<PropertyId, number>
}

const sameWidths = (
  left: ReadonlyMap<PropertyId, number>,
  right: ReadonlyMap<PropertyId, number>
) => (
  left.size === right.size
  && Array.from(left.entries()).every(([propertyId, width]) => right.get(propertyId) === width)
)

const samePreview = (
  left: ColumnWidthPreview | null,
  right: ColumnWidthPreview | null
) => {
  if (!left || !right) {
    return left === right
  }

  return left.propertyId === right.propertyId && sameWidths(left.widths, right.widths)
}

export const useColumnResize = () => {
  const editor = useEngine()
  const table = useTableContext()
  const currentView = useCurrentView()
  if (!currentView) {
    throw new Error('Table column resize requires an active current view.')
  }

  const columns = currentView.properties.all
  const canResize = useStoreValue(table.capabilities).canColumnResize
  const persistedWidths = useMemo(
    () => new Map(
      Object.entries(currentView.view.options.table.widths ?? {}) as [PropertyId, number][]
    ),
    [currentView.view.options.table.widths]
  )
  const [preview, setPreview] = useState<ColumnWidthPreview | null>(null)
  const previewRef = useRef<ColumnWidthPreview | null>(preview)

  const setPreviewState = useCallback((next: ColumnWidthPreview | null) => {
    previewRef.current = next
    setPreview(current => samePreview(current, next) ? current : next)
  }, [])

  useEffect(() => () => {
    setPreviewState(null)
  }, [setPreviewState])

  useEffect(() => {
    if (!preview || typeof document === 'undefined') {
      return
    }

    return disableUserSelect(document)
  }, [preview])

  const onResizeStart = useCallback((
    propertyId: PropertyId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canResize) {
      return
    }

    const node = closestTableTargetElement(event.currentTarget ?? null, 'column')
    if (!node) {
      return
    }

    const widths = new Map<PropertyId, number>()
    for (const columnNode of table.nodes.columns(columns.map(column => column.id))) {
      const columnId = columnNode.dataset.columnId as PropertyId | undefined
      if (!columnId) {
        continue
      }

      widths.set(
        columnId,
        Math.max(MIN_COLUMN_WIDTH, Math.round(columnNode.getBoundingClientRect().width))
      )
    }

    const startWidth = widths.get(propertyId)
      ?? Math.max(MIN_COLUMN_WIDTH, Math.round(node.getBoundingClientRect().width))
    const startX = event.clientX
    const started = table.interaction.start({
      mode: 'pointer',
      gesture: 'column-resize',
      event,
      capture: event.currentTarget instanceof Element
        ? event.currentTarget
        : null,
      move: nextEvent => {
        const nextWidth = Math.max(
          MIN_COLUMN_WIDTH,
          Math.round(startWidth + nextEvent.clientX - startX)
        )
        const current = previewRef.current
        const nextWidths = new Map(current?.widths ?? widths)
        if (nextWidths.get(propertyId) === nextWidth) {
          return
        }

        nextWidths.set(propertyId, nextWidth)
        setPreviewState({
          propertyId,
          widths: nextWidths
        })
      },
      up: () => {
        const current = previewRef.current
        if (current?.propertyId === propertyId) {
          const nextWidths: Partial<Record<PropertyId, number>> = {}
          columns.forEach(property => {
            const width = current.widths.get(property.id)
            if (!width) {
              return
            }

            nextWidths[property.id] = width
          })

          const persistedEntries = Array.from(persistedWidths.entries())
          const changed = (
            persistedEntries.length !== Object.keys(nextWidths).length
            || columns.some(property => persistedWidths.get(property.id) !== nextWidths[property.id])
          )

          if (changed) {
            editor.view(currentView.view.id).table.setColumnWidths(nextWidths)
          }
        }

        setPreviewState(null)
        table.focus()
      },
      cancel: () => {
        setPreviewState(null)
      }
    })

    if (!started) {
      return
    }

    setPreviewState({
      propertyId,
      widths
    })
  }, [
    canResize,
    columns,
    currentView.view.id,
    editor,
    persistedWidths,
    setPreviewState,
    table.focus,
    table.nodes,
    table.interaction
  ])

  return {
    active: preview !== null,
    preview,
    widths: preview?.widths ?? persistedWidths,
    onResizeStart
  }
}
