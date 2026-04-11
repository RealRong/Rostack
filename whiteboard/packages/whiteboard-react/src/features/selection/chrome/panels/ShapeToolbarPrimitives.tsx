import type { ReactNode } from 'react'
import { Button, cn } from '@ui'
import { preventToolbarPointerDown } from '../toolbar/primitives'

export const PANEL_SECTION_TITLE_CLASSNAME = 'text-xs font-semibold uppercase text-fg-muted'

export const Panel = ({
  children,
  className
}: {
  children: ReactNode
  className?: string
}) => (
  <div className={cn('flex min-w-[240px] flex-col gap-4 p-3', className)}>
    {children}
  </div>
)

export const PanelSection = ({
  title,
  children
}: {
  title: string
  children: ReactNode
}) => (
  <div className="flex flex-col gap-2">
    <div className={PANEL_SECTION_TITLE_CLASSNAME}>{title}</div>
    {children}
  </div>
)

export const SwatchButton = ({
  color,
  active = false,
  onClick
}: {
  color: string
  active?: boolean
  onClick: () => void
}) => (
  <button
    type="button"
    className={cn(
      'h-7 w-7 rounded-full border border-default transition-[transform,box-shadow,border-color] duration-150 hover:scale-[1.03] hover:border-strong',
      active && 'border-accent [box-shadow:0_0_0_2px_rgb(from_var(--ui-accent)_r_g_b_/_0.18)]'
    )}
    style={{
      background: color
    }}
    onPointerDown={preventToolbarPointerDown}
    onClick={onClick}
    aria-label={color}
  />
)

export const SegmentedButton = ({
  active = false,
  onClick,
  children
}: {
  active?: boolean
  onClick: () => void
  children: ReactNode
}) => (
  <Button
    variant="outline"
    size="sm"
    pressed={active}
    className={cn(
      'h-8 min-w-0 flex-1 rounded-lg px-2.5',
      active && 'border-accent bg-pressed text-fg'
    )}
    onPointerDown={preventToolbarPointerDown}
    onClick={onClick}
  >
    {children}
  </Button>
)
