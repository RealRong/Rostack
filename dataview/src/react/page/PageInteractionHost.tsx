import { createPortal } from 'react-dom'
import {
  BLOCKING_SURFACE_ATTR,
  BLOCKING_SURFACE_BACKDROP_ATTR
} from '@ui/blocking-surface'
import { cn } from '@ui/utils'
import { useDataView, usePageValue } from '@dataview/react/dataview'

export const PageInteractionHost = () => {
  const page = useDataView().page
  const active = usePageValue(state => (
    state.interaction.blockingSurfaces.at(-1) ?? null
  ))

  if (!active || typeof document === 'undefined') {
    return null
  }

  return createPortal(
    <div
      aria-hidden="true"
      className={cn(
        'fixed inset-0 z-40',
        active.backdrop === 'dim' ? 'bg-black/10' : 'bg-transparent'
      )}
      {...{
        [BLOCKING_SURFACE_ATTR]: '',
        [BLOCKING_SURFACE_BACKDROP_ATTR]: ''
      }}
      onPointerDown={event => {
        event.preventDefault()
        event.stopPropagation()
        if (active.dismissOnBackdropPress) {
          page.surface.dismissTop()
        }
      }}
      onMouseDown={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onClick={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
    />,
    document.body
  )
}
