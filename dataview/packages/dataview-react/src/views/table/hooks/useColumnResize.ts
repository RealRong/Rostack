import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type { FieldId } from '@dataview/core/contracts'
import {
  sameMap
} from '@shared/core'
import { disableUserSelect } from '@shared/dom'
import { useDataView } from '#react/dataview/index.ts'
import { useStoreValue } from '@shared/react'
import { closestTableTargetElement } from '#react/views/table/dom/targets.ts'
import { useTableContext } from '#react/views/table/context.tsx'
import { MIN_COLUMN_WIDTH } from '#react/views/table/layout.ts'

interface ColumnWidthPreview {
  fieldId: FieldId
  widths: ReadonlyMap<FieldId, number>
}

const sameWidths = (
  left: ReadonlyMap<FieldId, number>,
  right: ReadonlyMap<FieldId, number>
) => sameMap(left, right)

const samePreview = (
  left: ColumnWidthPreview | null,
  right: ColumnWidthPreview | null
) => {
  if (!left || !right) {
    return left === right
  }

  return left.fieldId === right.fieldId && sameWidths(left.widths, right.widths)
}

export const useColumnResize = () => {
  const editor = useDataView().engine
  const table = useTableContext()
  const currentView = useStoreValue(table.currentView)
  if (!currentView) {
    throw new Error('Table column resize requires an active current view.')
  }

  const columns = currentView.fields.all
  const canResize = useStoreValue(table.capabilities).canColumnResize
  const persistedWidths = useMemo(
    () => new Map(
      Object.entries(currentView.view.options.table.widths ?? {}) as [FieldId, number][]
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
    fieldId: FieldId,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => {
    if (!canResize) {
      return
    }

    const node = closestTableTargetElement(event.currentTarget ?? null, 'column')
    if (!node) {
      return
    }

    const widths = new Map<FieldId, number>()
    for (const columnNode of table.nodes.columns(columns.map(column => column.id))) {
      const columnId = columnNode.dataset.columnId as FieldId | undefined
      if (!columnId) {
        continue
      }

      widths.set(
        columnId,
        Math.max(MIN_COLUMN_WIDTH, Math.round(columnNode.getBoundingClientRect().width))
      )
    }

    const startWidth = widths.get(fieldId)
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
        if (nextWidths.get(fieldId) === nextWidth) {
          return
        }

        nextWidths.set(fieldId, nextWidth)
        setPreviewState({
          fieldId,
          widths: nextWidths
        })
      },
      up: () => {
        const current = previewRef.current
        if (current?.fieldId === fieldId) {
          const nextWidths: Partial<Record<FieldId, number>> = {}
          columns.forEach(field => {
            const width = current.widths.get(field.id)
            if (!width) {
              return
            }

            nextWidths[field.id] = width
          })

          const persistedEntries = Array.from(persistedWidths.entries())
          const changed = (
            persistedEntries.length !== Object.keys(nextWidths).length
            || columns.some(field => persistedWidths.get(field.id) !== nextWidths[field.id])
          )

          if (changed) {
            editor.active.table.setColumnWidths(nextWidths)
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
      fieldId,
      widths
    })
  }, [
    canResize,
    columns,
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
