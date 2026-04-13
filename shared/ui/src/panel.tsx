import * as React from 'react'
import { Button, type ButtonProps } from '#ui/button.tsx'
import { Slider } from '#ui/slider.tsx'
import { cn } from '#ui/utils.ts'

const SWATCH_SIZE_CLASS_NAMES = {
  sm: 'h-7 w-7',
  md: 'h-10 w-10'
} as const

export const PANEL_SECTION_TITLE_CLASSNAME = 'text-xs font-semibold uppercase text-fg-muted'

export const Panel = ({
  children,
  className
}: {
  children: React.ReactNode
  className?: string
}) => (
  <div className={cn('flex min-w-[240px] flex-col gap-4 p-3', className)}>
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
  ({ active, className, pressed, variant = 'outline', ...props }, ref) => (
    <Button
      ref={ref}
      variant={variant}
      pressed={pressed ?? active}
      className={cn('h-8 min-w-0 flex-1 rounded-lg px-2.5', className)}
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
  color: string
  size?: keyof typeof SWATCH_SIZE_CLASS_NAMES
}

export const SwatchButton = ({
  active = false,
  color,
  size = 'sm',
  className,
  type,
  ...props
}: SwatchButtonProps) => (
  <button
    type={type ?? 'button'}
    className={cn(
      SWATCH_SIZE_CLASS_NAMES[size],
      'rounded-full border border-default transition-[transform,box-shadow,border-color] duration-150 hover:scale-[1.03] hover:border-strong',
      active && 'border-accent [box-shadow:0_0_0_2px_rgb(from_var(--ui-accent)_r_g_b_/_0.18)]',
      className
    )}
    style={{
      background: color
    }}
    {...props}
  />
)

export const ColorSwatchGrid = ({
  options,
  value,
  onChange,
  className,
  swatchClassName,
  swatchSize = 'sm',
  onSwatchPointerDown
}: {
  options: readonly {
    value: string
  }[]
  value?: string
  onChange: (value: string) => void
  className?: string
  swatchClassName?: string
  swatchSize?: keyof typeof SWATCH_SIZE_CLASS_NAMES
  onSwatchPointerDown?: React.PointerEventHandler<HTMLButtonElement>
}) => (
  <div className={cn('grid grid-cols-5 gap-2', className)}>
    {options.map((option) => (
      <SwatchButton
        key={option.value}
        color={option.value}
        active={value === option.value}
        size={swatchSize}
        className={swatchClassName}
        onPointerDown={onSwatchPointerDown}
        onClick={() => onChange(option.value)}
        aria-label={option.value}
      />
    ))}
  </div>
)
