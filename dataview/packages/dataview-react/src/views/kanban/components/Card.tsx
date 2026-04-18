import {
  type CSSProperties
} from 'react'
import {
  resolveNeutralCardStyle,
  resolveOptionCardStyle
} from '@shared/ui/color'
import {
  RecordCard
} from '@dataview/react/views/shared'
import type { ItemId } from '@dataview/engine'
import { useKanbanRuntimeContext } from '@dataview/react/views/kanban/KanbanView'
import {
  useKeyedStoreValue,
  useStoreValue
} from '@shared/react'

export const Card = (props: {
  itemId: ItemId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const runtime = useKanbanRuntimeContext()
  const board = useStoreValue(runtime.board)
  const card = useKeyedStoreValue(runtime.card, props.itemId)
  if (!card) {
    return null
  }

  return (
    <RecordCard
      viewId={card.viewId}
      itemId={props.itemId}
      fields={card.fields}
      size={card.size}
      layout={card.layout}
      wrap={card.wrap}
      canDrag={card.canDrag}
      drag={runtime.drag}
      selection={runtime.selection}
      titlePlaceholder={record => record.id}
      showEditAction
      measureRef={props.measureRef}
      className={props.className}
      style={props.style}
      selectedStyle={{
        boxShadow: 'var(--ui-shadow-sm), 0 0 0 2px var(--ui-accent-frame-border)'
      }}
      resolveSurfaceStyle={({ hovered, editing }) => {
        const surfaceState = hovered && !editing ? 'hover' : 'default'
        return board.fillColumnColor
          ? resolveOptionCardStyle(card.color, surfaceState)
          : resolveNeutralCardStyle(surfaceState, 'preview')
      }}
    />
  )
}
