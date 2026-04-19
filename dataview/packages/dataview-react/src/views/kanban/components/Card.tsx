import {
  memo,
  useMemo,
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
  const interaction = useMemo(() => ({
    drag: runtime.drag,
    selection: runtime.selection
  }), [runtime.drag, runtime.selection])
  const appearance = useMemo(() => ({
    showEditAction: true,
    selectedStyle: {
      boxShadow: 'var(--ui-shadow-sm), 0 0 0 2px var(--ui-accent-frame-border)'
    } as const,
    resolveSurface: () => {
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
    }
  }), [board.fillColumnColor, cardColor])
  const mount = useMemo(() => ({
    measureRef: props.measureRef,
    className: props.className,
    style: props.style
  }), [props.className, props.measureRef, props.style])

  if (!card || !content) {
    return null
  }

  return (
    <RecordCard
      card={card}
      content={content}
      interaction={interaction}
      appearance={appearance}
      mount={mount}
    />
  )
}

export const Card = memo(CardComponent)
