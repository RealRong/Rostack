import {
  memo,
  useMemo,
  type CSSProperties
} from 'react'
import {
  RecordCard
} from '@dataview/react/views/shared'
import { resolveNeutralCardStyle } from '@shared/ui/color'
import type { ItemId } from '@dataview/engine'
import { useGalleryRuntimeContext } from '@dataview/react/views/gallery/GalleryView'
import {
  useKeyedStoreValue
} from '@shared/react'

const GALLERY_APPEARANCE = {
  showEditAction: true,
  resolveSurface: ({ selected }: { selected: boolean }) => (
    selected
      ? undefined
      : {
          default: resolveNeutralCardStyle('default', 'preview'),
          hover: resolveNeutralCardStyle('hover', 'preview')
        }
  )
} as const

const CardComponent = (props: {
  itemId: ItemId
  measureRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) => {
  const runtime = useGalleryRuntimeContext()
  const card = useKeyedStoreValue(runtime.card, props.itemId)
  const content = useKeyedStoreValue(runtime.content, props.itemId)
  const interaction = useMemo(() => ({
    drag: runtime.drag,
    selection: runtime.selection
  }), [runtime.drag, runtime.selection])
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
      appearance={GALLERY_APPEARANCE}
      mount={mount}
    />
  )
}

export const Card = memo(CardComponent)
