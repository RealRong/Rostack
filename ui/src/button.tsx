import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from './utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2.5 whitespace-nowrap rounded-lg border border-transparent text-sm font-medium transition-[background-color,border-color,color,opacity,box-shadow] duration-150 outline-none focus:outline-none focus-visible:outline-none focus:[box-shadow:none] focus-visible:[box-shadow:none] disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        default: 'bg-fg text-background hover:opacity-95',
        destructive: 'bg-destructive text-destructive-foreground hover:opacity-95',
        secondary: 'bg-transparent text-fg hover:bg-hover',
        outline: 'border-default bg-surface text-fg hover:border-strong hover:bg-hover',
        ghost: 'bg-transparent text-fg hover:bg-hover',
        plain: 'bg-transparent text-foreground hover:bg-transparent',
        ghostDestructive: 'bg-transparent text-destructive hover:bg-destructive/10 hover:text-destructive',
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
        row: 'h-8 w-full max-w-full justify-start rounded-lg px-2.5 text-left',
        chip: 'h-7 max-w-full justify-start rounded-lg bg-overlay-subtle px-2.5 text-left text-fg hover:bg-hover',
        panel: 'h-auto w-full max-w-full justify-start rounded-xl bg-overlay-subtle px-3 py-3 text-left hover:bg-hover'
      },
      pressed: {
        true: ''
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
    const usesPressableSurface = isRow || isChip || isPanel || resolvedVariant === 'ghost' || resolvedVariant === 'secondary'

    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        data-pressed={pressed ? 'true' : undefined}
        className={cn(
          buttonVariants({ variant: resolvedVariant, size: resolvedSize, layout: resolvedLayout, pressed }),
          shouldStartAlign && 'justify-start text-left',
          isChip && tone === 'subtle' && 'bg-transparent text-fg-muted hover:bg-hover hover:text-fg',
          usesPressableSurface && pressed && 'bg-pressed text-fg hover:bg-pressed',
          resolvedVariant === 'outline' && pressed && 'border-strong bg-pressed hover:bg-pressed',
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
