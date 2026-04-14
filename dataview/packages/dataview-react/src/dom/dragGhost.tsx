import {
  useEffect,
  useRef,
  type MutableRefObject,
  type ReactNode
} from 'react'
import { createPortal } from 'react-dom'
import type { PointerPosition } from '@dataview/react/interaction/usePointerDragSession'

const OFFSCREEN_TRANSLATE = 'translate3d(-9999px, -9999px, 0)'

export const cloneDragGhostNode = (
  source: HTMLElement | null
): HTMLElement | null => {
  if (!source) {
    return null
  }

  const rect = source.getBoundingClientRect()
  const clone = source.cloneNode(true) as HTMLElement
  clone.querySelector('[data-table-target="row-rail"]')?.remove()
  clone.style.width = `${Math.round(rect.width)}px`
  clone.style.height = `${Math.round(rect.height)}px`
  clone.style.margin = '0'
  clone.style.opacity = '0.3'
  clone.style.pointerEvents = 'none'

  return clone
}

export interface DragGhostProps {
  active: boolean
  node: HTMLElement | null
  pointerRef: MutableRefObject<PointerPosition | null>
  offsetRef: MutableRefObject<PointerPosition>
  badge?: ReactNode
}

export const DragGhost = (props: DragGhostProps) => {
  const ghostRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const pointer = props.pointerRef.current
  const offset = props.offsetRef.current

  useEffect(() => {
    if (!props.active) {
      contentRef.current?.replaceChildren()
      return
    }

    const content = contentRef.current
    if (!content || !props.node) {
      return
    }

    content.replaceChildren(props.node)
    return () => {
      content.replaceChildren()
    }
  }, [props.active, props.node])

  useEffect(() => {
    if (!props.active || typeof window === 'undefined') {
      return
    }

    let frame = 0
    const update = () => {
      const nextPointer = props.pointerRef.current
      const nextOffset = props.offsetRef.current
      const node = ghostRef.current
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
  }, [
    props.active,
    props.offsetRef,
    props.pointerRef
  ])

  if (!props.active || typeof document === 'undefined' || !props.node) {
    return null
  }

  return createPortal(
    <div
      ref={ghostRef}
      className="pointer-events-none fixed left-0 top-0 z-[999]"
      style={{
        transform: pointer
          ? `translate3d(${Math.round(pointer.x - offset.x)}px, ${Math.round(pointer.y - offset.y)}px, 0)`
          : OFFSCREEN_TRANSLATE
      }}
    >
      <div className="relative">
        <div
          ref={contentRef}
          className="relative drop-shadow-lg"
        />
        {props.badge ? (
          <div className="pointer-events-none absolute right-2 top-1/2 z-10 -translate-y-1/2">
            {props.badge}
          </div>
        ) : null}
      </div>
    </div>,
    document.body
  )
}
