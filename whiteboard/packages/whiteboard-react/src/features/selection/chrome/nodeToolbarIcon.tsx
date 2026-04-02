import type { ReactNode } from 'react'
import type { ToolbarIconState, ToolbarItemKey } from '../../../types/selection'

const SvgIcon = ({
  children,
  viewBox = '0 0 24 24'
}: {
  children: ReactNode
  viewBox?: string
}) => (
  <svg
    viewBox={viewBox}
    aria-hidden="true"
    className="wb-node-toolbar-icon"
    fill="none"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
)

const ICON_STROKE_WIDTH = 1

const resolveToolbarStrokePreviewWidth = (
  value?: number
) => {
  if (!Number.isFinite(value)) {
    return 2
  }

  return Math.min(4.5, Math.max(1.5, value as number))
}

export const ToolbarIcon = ({
  itemKey,
  state
}: {
  itemKey: ToolbarItemKey
  state: ToolbarIconState
}) => {
  switch (itemKey) {
    case 'fill':
      return (
        <SvgIcon>
          <path d="M8 5.5h6l3.5 3.5v1L11 17.5 6.5 13l7-7.5Z" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
          <path
            d="M5.5 19.5h13"
            stroke={state.fill ?? 'currentColor'}
            strokeWidth={2}
            strokeLinecap="round"
          />
        </SvgIcon>
      )
    case 'stroke':
      return (
        <SvgIcon>
          <path
            d="M5 18.5h14"
            stroke={state.stroke ?? 'currentColor'}
            strokeOpacity={state.opacity ?? 1}
            strokeWidth={resolveToolbarStrokePreviewWidth(state.strokeWidth)}
            strokeLinecap="round"
          />
          <path d="M5 7h14" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
        </SvgIcon>
      )
    case 'text':
      return (
        <SvgIcon>
          <path d="M7 6.5h10" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
          <path d="M12 6.5v11" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
        </SvgIcon>
      )
    case 'layout':
      return (
        <SvgIcon>
          <path d="M4.5 7h15" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
          <path d="M12 4.5v15" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
          <rect x="6" y="9" width="4" height="3" rx="0.75" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
          <rect x="14" y="9" width="4" height="6" rx="0.75" stroke="currentColor" strokeWidth={ICON_STROKE_WIDTH} />
        </SvgIcon>
      )
    case 'more':
      return (
        <SvgIcon>
          <circle cx="7" cy="12" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="17" cy="12" r="1.15" fill="currentColor" stroke="none" />
        </SvgIcon>
      )
  }
}
