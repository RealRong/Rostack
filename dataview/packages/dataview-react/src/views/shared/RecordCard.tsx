import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from 'react'
import type {
  CardLayout,
  CardSize,
  CustomField,
  DataRecord,
  RecordId,
  ViewId
} from '@dataview/core/contracts'
import { isEmptyFieldValue } from '@dataview/core/field'
import {
  DATAVIEW_APPEARANCE_ID_ATTR
} from '@dataview/react/dom/appearance'
import {
  useDataView,
  useDataViewKeyedValue
} from '@dataview/react/dataview'
import { shouldCapturePointer } from '@shared/dom'
import { useKeyedStoreValue } from '@shared/react'
import { cn } from '@shared/ui/utils'
import type { ItemId } from '@dataview/engine'
import { CardContent } from '@dataview/react/views/shared/CardContent'
import { resolveCardPresentation } from '@dataview/react/views/shared/cardPresentation'
import { useCardEditingState } from '@dataview/react/views/shared/useCardTitleEditing'

interface RecordCardDragRuntime {
  activeId: ItemId | undefined
  dragIdSet: ReadonlySet<ItemId>
  shouldIgnoreClick: () => boolean
  onPointerDown: (id: ItemId, event: ReactPointerEvent<HTMLElement>) => void
}

interface RecordCardSelectionRuntime {
  select: (id: ItemId, mode?: 'replace' | 'toggle') => void
}

export interface RecordCardProps {
  viewId: ViewId
  itemId: ItemId
  fields: readonly CustomField[]
  size: CardSize
  layout: CardLayout
  wrap: boolean
  canDrag: boolean
  drag: RecordCardDragRuntime
  selection: RecordCardSelectionRuntime
  titlePlaceholder: string | ((record: DataRecord) => string)
  showEditAction?: boolean
  presentationSelected?: boolean
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
  selectedStyle?: CSSProperties
  resolveSurfaceStyle?: (input: {
    hovered: boolean
    editing: boolean
    selected: boolean
    record: DataRecord
  }) => CSSProperties | undefined
}

const resolveTitlePlaceholder = (
  placeholder: RecordCardProps['titlePlaceholder'],
  record: DataRecord
) => (
  typeof placeholder === 'function'
    ? placeholder(record)
    : placeholder
)

export const RecordCard = (props: RecordCardProps) => {
  const dataView = useDataView()
  const engine = dataView.engine
  const recordId = engine.active.read.item(props.itemId)?.recordId ?? '' as RecordId
  const record = useDataViewKeyedValue(
    current => current.engine.select.records.byId,
    recordId
  )
  const committedSelected = useKeyedStoreValue(
    dataView.selection.store.membership,
    props.itemId
  )
  const previewSelected = useKeyedStoreValue(
    dataView.session.marquee.preview.membership,
    props.itemId
  )
  const draggingActive = props.drag.activeId === props.itemId
  const draggingSelected = props.drag.activeId !== undefined
    && props.drag.dragIdSet.has(props.itemId)
  const [hovered, setHovered] = useState(false)
  const editing = useCardEditingState({
    viewId: props.viewId,
    itemId: props.itemId
  })
  const selected = previewSelected ?? committedSelected

  const hasVisibleFields = useMemo(() => props.fields.some(field => (
    editing
    || !isEmptyFieldValue(record?.values[field.id])
  )), [editing, props.fields, record])
  const presentation = resolveCardPresentation({
    size: props.size,
    layout: props.layout,
    hasVisibleFields,
    selected: props.presentationSelected
      ? selected
      : false
  })
  const surfaceStyle = record
    ? props.resolveSurfaceStyle?.({
        hovered,
        editing,
        selected,
        record
      })
    : undefined

  if (!record) {
    return null
  }

  return (
    <CardContent
      ref={props.measureRef}
      {...{
        [DATAVIEW_APPEARANCE_ID_ATTR]: props.itemId
      }}
      onPointerEnter={() => {
        setHovered(true)
      }}
      onPointerLeave={() => {
        setHovered(false)
      }}
      onPointerDown={event => {
        if (editing) {
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.drag.onPointerDown(props.itemId, event)
      }}
      onClick={event => {
        if (editing) {
          return
        }

        if (props.drag.shouldIgnoreClick()) {
          event.preventDefault()
          event.stopPropagation()
          return
        }

        if (!shouldCapturePointer(event.target, event.currentTarget)) {
          return
        }

        props.selection.select(
          props.itemId,
          event.metaKey || event.ctrlKey ? 'toggle' : 'replace'
        )
      }}
      className={cn(
        'min-w-0',
        'touch-none',
        !editing && 'select-none',
        !editing && props.canDrag ? 'cursor-grab active:cursor-grabbing' : 'cursor-default',
        draggingActive && 'opacity-35',
        draggingSelected && !draggingActive && 'opacity-60',
        props.className
      )}
      style={{
        ...surfaceStyle,
        ...(selected
          ? props.selectedStyle
          : undefined),
        ...props.style
      }}
      slots={presentation.slots}
      viewId={props.viewId}
      itemId={props.itemId}
      record={record}
      fields={props.fields}
      titlePlaceholder={resolveTitlePlaceholder(props.titlePlaceholder, record)}
      showEditAction={props.showEditAction && hovered && !editing && !draggingActive}
      propertyDensity={presentation.propertyDensity}
      wrap={props.wrap}
    />
  )
}
