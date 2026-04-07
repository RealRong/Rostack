import type { ReactNode } from 'react'
import { Button, cn } from '@ui'

export const ToolbarDivider = () => (
  <div className="mx-1 h-6 w-0 shrink-0 border-r" />
)

export const ToolbarIconButton = ({
  active = false,
  onClick,
  title,
  children
}: {
  active?: boolean
  onClick: () => void
  title: string
  children: ReactNode
}) => (
  <Button
    variant="ghost"
    size="icon"
    pressed={active}
    className={cn(
      'h-9 w-9 rounded-xl text-fg',
      active && 'bg-pressed text-fg'
    )}
    onClick={onClick}
    title={title}
    aria-label={title}
  >
    {children}
  </Button>
)

export const ToolbarTextColorIcon = ({
  color
}: {
  color?: string
}) => (
  <span className="relative inline-flex h-5 w-5 items-center justify-center">
    <span className="text-base font-semibold leading-none">A</span>
    <span
      className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full"
      style={{
        background: color ?? 'var(--ui-text-primary)'
      }}
    />
  </span>
)

export const ToolbarStrokeIcon = ({
  stroke,
  strokeWidth,
  strokeDash,
  opacity
}: {
  stroke?: string
  strokeWidth?: number
  strokeDash?: readonly number[]
  opacity?: number
}) => (
  <svg
    viewBox="0 0 24 24"
    className="h-5 w-5"
    fill="none"
  >
    <rect
      x="4.5"
      y="5"
      width="15"
      height="14"
      rx="3"
      stroke={stroke ?? 'currentColor'}
      strokeWidth={Math.min(2.2, Math.max(1.2, strokeWidth ?? 1.5))}
      strokeDasharray={strokeDash?.join(' ')}
      strokeOpacity={opacity ?? 1}
    />
  </svg>
)

export const ToolbarFillIcon = ({
  fill,
  opacity
}: {
  fill?: string
  opacity?: number
}) => (
  <span
    className="inline-block h-4.5 w-4.5 rounded-md border border-default"
    style={{
      background: fill ?? 'var(--ui-surface)',
      opacity: opacity ?? 1
    }}
  />
)
