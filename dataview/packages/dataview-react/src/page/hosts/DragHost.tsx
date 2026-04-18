import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef
} from 'react'
import { createPortal } from 'react-dom'
import { useDataViewValue } from '@dataview/react/dataview'
import { cloneDragNode } from '@dataview/react/dom/drag'
import { cn } from '@shared/ui/utils'

const OFFSCREEN_TRANSLATE = 'translate3d(-9999px, -9999px, 0)'

const cardStackStyle = (radius: string | undefined, opacity: number) => ({
  borderRadius: radius,
  opacity
})

export const DragHost = () => {
  const drag = useDataViewValue(dataView => dataView.react.drag.store)
  const rootRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const pointer = drag?.pointerRef.current
  const offset = drag?.offsetRef.current
  const ownerDocument = drag?.source?.ownerDocument
  const initialTransform = pointer && offset
    ? `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
    : OFFSCREEN_TRANSLATE
  const cardRadius = useMemo(() => (
    drag?.kind === 'card' && drag.source
      ? drag.source.ownerDocument.defaultView?.getComputedStyle(drag.source).borderRadius
      : undefined
  ), [drag?.kind, drag?.source])

  useLayoutEffect(() => {
    const content = contentRef.current
    if (!drag?.active || !content) {
      content?.replaceChildren()
      return
    }

    const node = cloneDragNode(drag.source, {
      size: drag.size,
      scrubSelectors: drag.scrubSelectors
    })
    if (!node) {
      content.replaceChildren()
      return
    }

    content.replaceChildren(node)
    return () => {
      content.replaceChildren()
    }
  }, [drag])

  useEffect(() => {
    if (!drag?.active || typeof window === 'undefined') {
      return
    }

    let frame = 0
    const update = () => {
      const nextPointer = drag.pointerRef.current
      const nextOffset = drag.offsetRef.current
      const node = rootRef.current
      if (node) {
        node.style.transform = nextPointer
          ? `translate3d(${Math.round(nextPointer.x - nextOffset.x)}px, ${Math.round(nextPointer.y - nextOffset.y)}px, 0)`
          : OFFSCREEN_TRANSLATE
      }
      frame = window.requestAnimationFrame(update)
    }

    frame = window.requestAnimationFrame(update)
    return () => {
      window.cancelAnimationFrame(frame)
    }
  }, [drag])

  if (!drag?.active || !ownerDocument) {
    return null
  }

  return createPortal(
    <div
      ref={rootRef}
      className="pointer-events-none fixed left-0 top-0 z-[999]"
      style={{
        width: drag.size.width,
        height: drag.size.height,
        transform: initialTransform
      }}
    >
      <div className="relative">
        {drag.kind === 'card' && drag.extraCount > 0 ? (
          <>
            <div
              className="absolute inset-x-3 top-3 h-full border bg-background/80 shadow-sm"
              style={cardStackStyle(cardRadius, 0.65)}
            />
            <div
              className="absolute inset-x-1.5 top-1.5 h-full border bg-background/90 shadow-sm"
              style={cardStackStyle(cardRadius, 0.82)}
            />
          </>
        ) : null}
        <div className={cn(drag.kind === 'card' && drag.extraCount > 0 && 'relative')}>
          <div
            ref={contentRef}
            className={cn(
              'relative drop-shadow-lg',
              drag.kind === 'row' && 'opacity-30'
            )}
          />
          {drag.kind === 'row' && drag.extraCount > 0 ? (
            <div className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2">
              <span className="rounded-full border border-accent-divider bg-accent-tint px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
                +{drag.extraCount}
              </span>
            </div>
          ) : null}
          {drag.kind === 'card' && drag.extraCount > 0 ? (
            <div className="pointer-events-none absolute right-3 top-3 z-10">
              <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-foreground px-1.5 py-0.5 text-[10px] font-semibold text-background">
                {drag.extraCount + 1}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>,
    ownerDocument.body
  )
}
