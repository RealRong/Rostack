import * as React from 'react'
import { Button, type ButtonProps } from '@shared/ui/button'
import { Slider } from '@shared/ui/slider'
import { cn } from '@shared/ui/utils'

const SWATCH_SIZE_CLASS_NAMES = {
  sm: 'size-[20px]',
  md: 'size-[32px]'
} as const

const SWATCH_SIZE_PX = {
  sm: 20,
  md: 32
} as const

export const PANEL_SECTION_TITLE_CLASSNAME = 'text-xs font-semibold text-fg-muted'

export const Panel = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div className={cn('flex flex-col gap-4 p-2', className)}>
    {children}
  </div>
)

export const PanelSection = ({
  title,
  children,
  className,
  titleClassName
}: {
  title: string
  children: React.ReactNode
  className?: string
  titleClassName?: string
}) => (
  <div className={cn('flex flex-col gap-2', className)}>
    <div className={cn(PANEL_SECTION_TITLE_CLASSNAME, titleClassName)}>{title}</div>
    {children}
  </div>
)

export const formatPercent = (
  value: number
) => `${Math.round(value * 100)}%`

export const SliderSection = ({
  title,
  value,
  min,
  max,
  step,
  formatValue,
  onChange,
  className
}: {
  title: string
  value: number
  min: number
  max: number
  step: number
  formatValue?: (value: number) => string
  onChange: (value: number) => void
  className?: string
}) => (
  <PanelSection title={title} className={className}>
    <Slider
      min={min}
      max={max}
      step={step}
      value={value}
      formatValue={formatValue}
      onValueChange={onChange}
      onValueCommit={onChange}
    />
  </PanelSection>
)

export interface SegmentedButtonProps extends ButtonProps {
  active?: boolean
}

export const SegmentedButton = React.forwardRef<HTMLButtonElement, SegmentedButtonProps>(
  ({ active, className, pressed, variant = 'ghost', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      pressed={pressed ?? active}
      className={cn('h-8 min-w-0 flex-1', className)}
      {...props}
    />
  )
)

SegmentedButton.displayName = 'SegmentedButton'

export interface SwatchButtonProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  'color'
> {
  active?: boolean
  color?: string
  size?: keyof typeof SWATCH_SIZE_CLASS_NAMES
  shape?: 'round' | 'square'
  transparent?: boolean
}

export const SwatchButton = ({
  active = false,
  color,
  size = 'sm',
  shape = 'round',
  transparent = false,
  className,
  type,
  ...props
}: SwatchButtonProps) => (
  <button
    type={type ?? 'button'}
    className={cn(
      SWATCH_SIZE_CLASS_NAMES[size],
      shape === 'square' ? 'rounded-md' : 'rounded-full',
      'relative border border-default transition-[transform,box-shadow,border-color] duration-150 hover:border-accent',
      active && 'border-accent [box-shadow:0_0_0_2px_rgb(from_var(--ui-accent)_r_g_b_/_0.18)]',
      className
    )}
    style={{
      background: transparent ? 'transparent' : color
    }}
    {...props}
  >
    {transparent ? (
      <span className="pointer-events-none absolute inset-[3px] rounded-[inherit] bg-surface" />
    ) : null}
    {transparent ? (
      <span className="pointer-events-none absolute inset-0 block overflow-hidden rounded-[inherit]">
        <span className="absolute left-1/2 top-[-15%] h-[130%] w-px -translate-x-1/2 rotate-45 bg-fg-muted" />
      </span>
    ) : null}
  </button>
)

export const ColorSwatchGrid = ({
  options,
  value,
  onChange,
  className,
  swatchClassName,
  swatchSize = 'sm',
  onSwatchPointerDown,
  columns,
  swatchShape = 'round'
}: {
  options: readonly {
    value: string
    color?: string
    ariaLabel?: string
    transparent?: boolean
  }[]
  value?: string
  onChange: (value: string) => void
  className?: string
  swatchClassName?: string
  swatchSize?: keyof typeof SWATCH_SIZE_CLASS_NAMES
  onSwatchPointerDown?: React.PointerEventHandler<HTMLButtonElement>
  columns?: number
  swatchShape?: 'round' | 'square'
}) => (
  <div className={cn('grid gap-2', className)} style={{
    gridTemplateColumns: columns
      ? `repeat(${columns}, ${SWATCH_SIZE_PX[swatchSize]}px)`
      : `repeat(auto-fill, ${SWATCH_SIZE_PX[swatchSize]}px)`
  }}>
    {options.map((option) => (
      <SwatchButton
        key={option.value}
        color={option.color ?? option.value}
        active={value === option.value}
        size={swatchSize}
        shape={swatchShape}
        transparent={option.transparent}
        className={swatchClassName}
        onPointerDown={onSwatchPointerDown}
        onClick={() => onChange(option.value)}
        aria-label={option.ariaLabel ?? option.value}
      />
    ))}
  </div>
)
