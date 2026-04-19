import {
  memo,
  useCallback,
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

const KANBAN_SELECTED_STYLE = {
  boxShadow: 'var(--ui-shadow-sm), 0 0 0 2px var(--ui-accent-frame-border)'
} as const

const CardComponent = (props: {
  itemId: ItemId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const runtime = useKanbanRuntimeContext()
  const board = useStoreValue(runtime.board)
  const card = useKeyedStoreValue(runtime.card, props.itemId)
  const content = useKeyedStoreValue(runtime.content, props.itemId)
  const cardColor = card?.color
  const resolveSurface = useCallback(() => {
    const defaultState = 'default' as const
    const hoverState = 'hover' as const
    return {
      default: board.fillColumnColor
        ? resolveOptionCardStyle(cardColor, defaultState)
        : resolveNeutralCardStyle(defaultState, 'preview'),
      hover: board.fillColumnColor
        ? resolveOptionCardStyle(cardColor, hoverState)
        : resolveNeutralCardStyle(hoverState, 'preview')
    }
  }, [board.fillColumnColor, cardColor])

  if (!card || !content) {
    return null
  }

  return (
    <RecordCard
      card={card}
      content={content}
      drag={runtime.drag}
      selection={runtime.selection}
      showEditAction
      selectedStyle={KANBAN_SELECTED_STYLE}
      resolveSurface={resolveSurface}
      measureRef={props.measureRef}
      className={props.className}
      style={props.style}
    />
  )
}

export const Card = memo(CardComponent)
