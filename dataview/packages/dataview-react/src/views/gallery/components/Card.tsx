import {
  type CSSProperties
} from 'react'
import {
  RecordCard
} from '@dataview/react/views/shared'
import { resolveNeutralCardStyle } from '@shared/ui/color'
import type { ItemId } from '@dataview/engine'
import { useGalleryRuntimeContext } from '@dataview/react/views/gallery/GalleryView'
import {
  CARD_TITLE_PLACEHOLDER
} from '@dataview/react/views/shared/cardTitleValue'
import {
  useKeyedStoreValue
} from '@shared/react'

export const Card = (props: {
  itemId: ItemId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const runtime = useGalleryRuntimeContext()
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
