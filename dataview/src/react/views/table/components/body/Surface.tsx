import type {
  ClipboardEventHandler,
  KeyboardEventHandler,
  PointerEventHandler,
  ReactNode
} from 'react'
import { PAGE_INLINE_INSET_CSS } from '@dataview/react/page/layout'
import { useTableContext } from '../../context'

const PAGE_PADDING_BOTTOM = 180

export interface SurfaceProps {
  rowCount: number
  colCount: number
  onPointerDown: PointerEventHandler<HTMLDivElement>
  onPointerMove: PointerEventHandler<HTMLDivElement>
  onPointerLeave: PointerEventHandler<HTMLDivElement>
  onKeyDown: KeyboardEventHandler<HTMLDivElement>
  onPaste: ClipboardEventHandler<HTMLDivElement>
  children?: ReactNode
}

export const Surface = (props: SurfaceProps) => {
  const table = useTableContext()
  const layout = table.layout

  return (
    <div
      ref={layout.containerRef}
      onPointerDown={props.onPointerDown}
      onPointerMove={props.onPointerMove}
      onPointerLeave={props.onPointerLeave}
      role="grid"
      aria-rowcount={props.rowCount}
      aria-colcount={props.colCount}
      tabIndex={0}
      onKeyDown={props.onKeyDown}
      onPaste={props.onPaste}
      className="relative overflow-x-auto overflow-y-visible focus:outline-none"
      style={{
        overflowAnchor: 'none'
      }}
    >
      <div
        ref={layout.canvasRef}
        style={{
          position: 'relative',
          minWidth: '100%',
          display: 'inline-block',
          verticalAlign: 'top',
          boxSizing: 'border-box',
          overflowAnchor: 'none',
          paddingInline: PAGE_INLINE_INSET_CSS,
          paddingBottom: PAGE_PADDING_BOTTOM
        }}
      >
        {props.children}
      </div>
    </div>
  )
}
