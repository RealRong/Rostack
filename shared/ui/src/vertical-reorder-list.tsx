import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DraggableAttributes,
  type DraggableSyntheticListeners,
  type Modifier
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import {
  useCallback,
  useMemo,
  useRef,
  type ReactNode
} from 'react'
import { cn } from '#shared-ui/utils'

const clamp = (value: number, min: number, max: number) => (
  Math.min(Math.max(value, min), max)
)

export interface VerticalReorderHandleProps {
  attributes: DraggableAttributes
  listeners?: DraggableSyntheticListeners
  setActivatorNodeRef: (element: HTMLElement | null) => void
}

export interface VerticalReorderItemState {
  handle: VerticalReorderHandleProps
  dragging: boolean
}

export interface VerticalReorderListProps<Item> {
  items: readonly Item[]
  getItemId: (item: Item, index: number) => string
  onMove: (from: number, to: number) => void
  renderItem: (
    item: Item,
    state: VerticalReorderItemState,
    index: number
  ) => ReactNode
  className?: string
}

interface VerticalReorderListItemProps<Item> {
  item: Item
  index: number
  itemId: string
  renderItem: VerticalReorderListProps<Item>['renderItem']
}

const VerticalReorderListItem = <Item,>(props: VerticalReorderListItemProps<Item>) => {
  const sortable = useSortable({
    id: props.itemId,
    transition: {
      duration: 160,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    }
  })
  const transform = sortable.transform
    ? `translate3d(${Math.round(sortable.transform.x)}px, ${Math.round(sortable.transform.y)}px, 0)`
    : undefined

  return (
    <div
      ref={sortable.setNodeRef}
      style={{
        transform,
        transition: sortable.transition,
        position: 'relative',
        zIndex: sortable.isDragging ? 1 : undefined
      }}
    >
      {props.renderItem(props.item, {
        handle: {
          attributes: sortable.attributes,
          listeners: sortable.listeners,
          setActivatorNodeRef: sortable.setActivatorNodeRef
        },
        dragging: sortable.isDragging
      }, props.index)}
    </div>
  )
}

export const VerticalReorderList = <Item,>(props: VerticalReorderListProps<Item>) => {
  const listRef = useRef<HTMLDivElement | null>(null)
  const itemIds = useMemo(
    () => props.items.map((item, index) => props.getItemId(item, index)),
    [props.getItemId, props.items]
  )
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6
      }
    })
  )
  const modifiers = useMemo<Modifier[]>(() => [
    ({ transform, activeNodeRect, draggingNodeRect }) => {
      const containerRect = listRef.current?.getBoundingClientRect()
      const nodeRect = draggingNodeRect ?? activeNodeRect

      if (!containerRect || !nodeRect) {
        return {
          ...transform,
          x: 0
        }
      }

      const minY = containerRect.top - nodeRect.top
      const maxY = containerRect.bottom - nodeRect.bottom

      return {
        ...transform,
        x: 0,
        y: clamp(transform.y, minY, maxY)
      }
    }
  ], [])
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const sourceId = event.active.id?.toString()
    const overId = event.over?.id?.toString()

    if (!sourceId || !overId || sourceId === overId) {
      return
    }

    const from = itemIds.indexOf(sourceId)
    const to = itemIds.indexOf(overId)
    if (from === -1 || to === -1 || from === to) {
      return
    }

    props.onMove(from, to)
  }, [itemIds, props.onMove])

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={modifiers}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={itemIds}
        strategy={verticalListSortingStrategy}
      >
        <div ref={listRef} className={cn('flex flex-col gap-2', props.className)}>
          {props.items.map((item, index) => (
            <VerticalReorderListItem
              key={itemIds[index]}
              item={item}
              index={index}
              itemId={itemIds[index]}
              renderItem={props.renderItem}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  )
}
