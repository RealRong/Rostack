import { Check, ChevronRight, GripVertical } from 'lucide-react'
import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { Button } from '../button'
import { Switch } from '../switch'
import { cn } from '../utils'
import type { VerticalReorderHandleProps } from '../vertical-reorder-list'
import {
  resolveItemClassName,
  resolveSurfaceClassName
} from './shared'

type Tone = 'default' | 'destructive'

interface ContentProps {
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  tone?: Tone
}

export const Content = (props: ContentProps) => {
  const destructive = props.tone === 'destructive'

  return (
    <>
      {props.leading !== undefined && props.leading !== null ? (
        <span className={cn(
          'inline-flex shrink-0 items-center justify-center',
          destructive ? 'text-current' : 'text-muted-foreground'
        )}>
          {props.leading}
        </span>
      ) : null}

      <span className={cn(
        'min-w-0 truncate flex-1',
        destructive ? 'text-[13px] text-destructive' : 'text-[13px] text-foreground'
      )}>
        {props.label}
      </span>

      {props.suffix !== undefined && props.suffix !== null && props.suffix !== '' ? (
        <span className={cn(
          'max-w-[160px] shrink-0 truncate text-xs',
          destructive ? 'text-destructive' : 'text-muted-foreground'
        )}>
          {props.suffix}
        </span>
      ) : null}

      {props.trailing !== undefined && props.trailing !== null ? (
        <span className={cn(
          'shrink-0 leading-none',
          destructive ? 'text-current' : 'text-muted-foreground'
        )}>
          {props.trailing}
        </span>
      ) : null}
    </>
  )
}

interface ButtonRowProps extends Omit<React.ComponentProps<typeof Button>, 'children' | 'leading' | 'suffix' | 'trailing' | 'layout' | 'tone'> {
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  tone?: Tone
  active: boolean
  highlightedClassName?: string
  surface?: 'filled' | 'ghost'
}

export const ButtonRow = forwardRef<HTMLButtonElement, ButtonRowProps>((props, ref) => {
  const {
    label,
    leading,
    suffix,
    trailing,
    tone,
    active,
    highlightedClassName,
    surface = 'filled',
    className,
    ...buttonProps
  } = props
  const destructive = tone === 'destructive'

  return (
    <Button
      ref={ref}
      layout="row"
      variant={destructive ? 'ghostDestructive' : undefined}
      className={cn(
        surface === 'filled'
          ? resolveItemClassName({
              active,
              destructive
            })
          : 'bg-transparent px-1.5 hover:bg-transparent',
        className,
        active && highlightedClassName
      )}
      {...buttonProps}
    >
      <Content
        label={label}
        leading={leading}
        suffix={suffix}
        trailing={trailing}
        tone={tone}
      />
    </Button>
  )
})

ButtonRow.displayName = 'ButtonRow'

interface SurfaceRowProps extends HTMLAttributes<HTMLDivElement> {
  active: boolean
  tone?: Tone
  dragging?: boolean
  disabled?: boolean
}

export const SurfaceRow = (props: SurfaceRowProps) => {
  const {
    active,
    tone,
    dragging,
    disabled,
    className,
    children,
    ...domProps
  } = props

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-lg px-1.5 py-0.5 transition-colors',
        resolveSurfaceClassName({
          active,
          destructive: tone === 'destructive'
        }),
        disabled && 'pointer-events-none opacity-40',
        dragging && 'opacity-70',
        className
      )}
      {...domProps}
    >
      {children}
    </div>
  )
}

interface HandleProps {
  ariaLabel: string
  icon?: ReactNode
  onActive?: () => void
  attributes?: VerticalReorderHandleProps['attributes']
  listeners?: VerticalReorderHandleProps['listeners']
  setActivatorNodeRef?: VerticalReorderHandleProps['setActivatorNodeRef']
}

export const Handle = (props: HandleProps) => (
  <Button
    variant="plain"
    size="iconBare"
    aria-label={props.ariaLabel}
    {...props.attributes}
    {...props.listeners}
    ref={props.setActivatorNodeRef}
    style={{ touchAction: 'none' }}
    onMouseEnter={props.onActive}
    onMouseDown={event => {
      event.stopPropagation()
    }}
    onClick={event => {
      event.stopPropagation()
    }}
  >
    {props.icon ?? (
      <GripVertical className="size-4 cursor-grab text-muted-foreground" size={16} strokeWidth={1.8} />
    )}
  </Button>
)

export const checkTrailing = () => (
  <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
)

export const switchTrailing = (checked: boolean, disabled?: boolean) => (
  <Switch
    checked={checked}
    onCheckedChange={() => undefined}
    disabled={disabled}
    interactive={false}
  />
)

export const submenuArrow = (input: {
  presentation: 'cascade' | 'dropdown'
  open: boolean
}) => (
  <ChevronRight
    className={cn(
      'size-4 transition-transform',
      input.presentation === 'dropdown' && input.open && 'rotate-90'
    )}
    size={16}
    strokeWidth={1.8}
  />
)

export const handleActivationKey = (event: KeyboardEvent<HTMLElement>) => (
  event.key === 'Enter' || event.key === ' '
)
