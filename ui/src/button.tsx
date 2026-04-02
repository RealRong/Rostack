import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const buttonVariants = cva(
  'ui-button inline-flex shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-lg text-sm font-medium transition-colors duration-150 outline-none focus-visible:outline-none disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'ui-button-primary',
        destructive: 'ui-button-destructive',
        secondary: 'ui-control',
        outline: 'ui-button-outline',
        ghost: 'ui-control',
        plain: 'bg-transparent text-foreground hover:bg-transparent',
        ghostDestructive: 'ui-control text-destructive hover:bg-destructive/10 hover:text-destructive',
        link: 'text-primary underline-offset-4 hover:underline'
      },
      size: {
        sm: 'h-8 px-2 text-sm',
        lg: 'h-9 px-3 text-sm',
        icon: 'h-7 w-7',
        iconBare: 'h-5 w-5'
      },
      layout: {
        default: '',
        row: 'ui-hover-control h-8 w-full max-w-full justify-start text-left',
        chip: 'ui-chip-control h-7 max-w-full justify-start rounded-lg px-2.5',
        panel: 'ui-panel-control h-auto w-full max-w-full justify-start rounded-xl px-3 py-3 text-left'
      },
      pressed: {
        true: 'ui-button--pressed'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'sm',
      layout: 'default',
      pressed: false
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  leading?: React.ReactNode
  suffix?: React.ReactNode
  trailing?: React.ReactNode
  tone?: 'default' | 'subtle'
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({
    variant,
    size,
    layout,
    pressed,
    asChild = false,
    leading,
    suffix,
    trailing,
    tone = 'default',
    children,
    type,
    className,
    ...props
  }, ref) => {
    const Comp = asChild ? Slot : 'button'
    const hasStructuredContent = leading !== undefined || suffix !== undefined || trailing !== undefined
    const resolvedSize = size ?? 'sm'
    const resolvedLayout = layout ?? 'default'
    const isRow = resolvedLayout === 'row'
    const isChip = resolvedLayout === 'chip'
    const isPanel = resolvedLayout === 'panel'
    const resolvedVariant = variant ?? (
      resolvedSize === 'icon' || resolvedSize === 'iconBare' || isRow || isChip || isPanel || hasStructuredContent
        ? 'ghost'
        : 'default'
    )
    const isGhostDestructive = resolvedVariant === 'ghostDestructive'
    const shouldStartAlign = isRow || isChip || isPanel || (hasStructuredContent && resolvedSize !== 'icon' && resolvedSize !== 'iconBare')
    const shouldFlexLabel = isRow || isPanel

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        data-pressed={pressed ? 'true' : undefined}
        className={cn(
          buttonVariants({ variant: resolvedVariant, size: resolvedSize, layout: resolvedLayout, pressed }),
          shouldStartAlign && 'justify-start text-left',
          isChip && tone === 'subtle' && 'ui-chip-control--subtle',
          isRow && pressed && 'ui-hover-control--selected',
          isChip && pressed && 'ui-chip-control--active',
          isPanel && pressed && 'ui-panel-control--active',
          className
        )}
        {...props}
      >
        {hasStructuredContent ? (
          <>
            {leading !== undefined && leading !== null ? (
              <span className={cn(
                'inline-flex shrink-0 items-center justify-center',
                isGhostDestructive ? 'text-current' : 'text-muted-foreground'
              )}>
                {leading}
              </span>
            ) : null}
            {children !== undefined && children !== null ? (
              <span className={cn(
                'min-w-0 truncate',
                shouldFlexLabel && 'flex-1',
                isRow && (isGhostDestructive ? 'text-[13px] text-destructive' : 'text-[13px] text-foreground')
              )}>
                {children}
              </span>
            ) : null}
            {suffix !== undefined && suffix !== null && suffix !== '' ? (
              <span className={cn(
                'max-w-[160px] shrink-0 truncate text-xs',
                isGhostDestructive ? 'text-destructive' : 'text-muted-foreground'
              )}>
                {suffix}
              </span>
            ) : null}
            {trailing !== undefined && trailing !== null ? (
              <span className={cn(
                'shrink-0 leading-none',
                isGhostDestructive ? 'text-current' : 'text-muted-foreground'
              )}>
                {trailing}
              </span>
            ) : null}
          </>
        ) : children}
      </Comp>
    )
  }
)

Button.displayName = 'Button'
