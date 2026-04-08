import {
  useCallback,
  useMemo
} from 'react'
import {
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core'
import type { FieldId } from '@dataview/core/contracts'
import { columnBeforeId } from '@dataview/table'
import { useDataView, useDataViewValue } from '@dataview/react/dataview'
import { useTableContext } from '../context'

const COLUMN_SORT_SCOPE_SEPARATOR = '\u0000'

export const columnSortId = (
  scopeId: string,
  fieldId: FieldId
) => `${scopeId}${COLUMN_SORT_SCOPE_SEPARATOR}${fieldId}`

const columnPropertyId = (
  id: string
): FieldId | null => {
  const index = id.lastIndexOf(COLUMN_SORT_SCOPE_SEPARATOR)
  const fieldId = index === -1
    ? id
    : id.slice(index + COLUMN_SORT_SCOPE_SEPARATOR.length)

  return fieldId
    ? fieldId as FieldId
    : null
}

export interface ColumnReorderApi {
  onDragCancel: () => void
  onDragEnd: (event: DragEndEvent) => void
  onDragStart: () => void
  sensors: ReturnType<typeof useSensors>
}

export const useColumnReorder = (): ColumnReorderApi => {
  const editor = useDataView().engine
  const table = useTableContext()
  const currentView = useDataViewValue(dataView => dataView.currentView)
  if (!currentView) {
    throw new Error('Table column reorder requires an active current view.')
  }

  const columns = currentView.fields.all
  const fieldIds = useMemo(
    () => columns.map(field => field.id),
    [columns]
  )
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    })
  )

  const onDragStart = useCallback(() => {
    table.interaction.start({
      mode: 'drag',
      gesture: 'column-reorder'
    })
  }, [table.interaction])

  const finishDrag = useCallback(() => {
    table.interaction.cancel()
    table.focus()
  }, [table.focus, table.interaction])

  const onDragEnd = useCallback((event: DragEndEvent) => {
    const sourceId = event.active.id?.toString()
    const overId = event.over?.id?.toString()
    const sourcePropertyId = sourceId
      ? columnPropertyId(sourceId)
      : null
    const overPropertyId = overId
      ? columnPropertyId(overId)
      : null

    if (!sourcePropertyId || !overPropertyId || sourcePropertyId === overPropertyId) {
      finishDrag()
      return
    }

    const beforeId = columnBeforeId({
      columnIds: fieldIds,
      sourceId: sourcePropertyId,
      overId: overPropertyId
    })
    if (beforeId === undefined) {
      finishDrag()
      return
    }

    editor.view(currentView.view.id).display.move(
      [sourcePropertyId],
      beforeId
    )
    finishDrag()
  }, [currentView.view.id, editor, finishDrag, fieldIds])

  const onDragCancel = useCallback(() => {
    finishDrag()
  }, [finishDrag])

  return useMemo(() => ({
    onDragCancel,
    onDragEnd,
    onDragStart,
    sensors
  }), [onDragCancel, onDragEnd, onDragStart, sensors])
}
