import {
  type CSSProperties
} from 'react'
import {
  RecordCard
} from '@dataview/react/views/shared'
import { resolveNeutralCardStyle } from '@shared/ui/color'
import type { ItemId } from '@dataview/engine'
import { useGalleryContext } from '@dataview/react/views/gallery/context'
import {
  CARD_TITLE_PLACEHOLDER
} from '@dataview/react/views/shared/cardTitleValue'

export const Card = (props: {
  itemId: ItemId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const {
    active,
    extra,
    runtime
  } = useGalleryContext()

  return (
    <RecordCard
      viewId={active.view.id}
      itemId={props.itemId}
      fields={active.fields.custom}
      size={extra.card.size}
      layout={extra.card.layout}
      wrap={extra.card.wrap}
      canDrag={extra.canReorder}
      drag={runtime.drag}
      selection={runtime.selection}
      titlePlaceholder={CARD_TITLE_PLACEHOLDER}
      showEditAction
      presentationSelected
      measureRef={props.measureRef}
      className={props.className}
      style={props.style}
      resolveSurfaceStyle={({ hovered, editing, selected }) => (
        !selected
          ? resolveNeutralCardStyle(hovered && !editing ? 'hover' : 'default', 'preview')
          : undefined
      )}
    />
  )
}
