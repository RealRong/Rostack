import { Check, ChevronRight, GripVertical } from 'lucide-react'
import {
  forwardRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode
} from 'react'
import { Switch } from '#shared-ui/switch'
import { cn } from '#shared-ui/utils'
import type { VerticalReorderHandleProps } from '#shared-ui/vertical-reorder-list'
import { resolveRowAppearance } from '#shared-ui/menu/shared'
import type { ActiveSource, SelectionAppearance } from '#shared-ui/menu/types'

type Tone = 'default' | 'destructive'

interface ContentProps {
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  tone?: Tone
}

const stopPropagation = (event: {
  stopPropagation: () => void
}) => {
  event.stopPropagation()
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
        'min-w-0 flex-1 truncate',
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

interface RowProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  label: ReactNode
  leading?: ReactNode
  suffix?: ReactNode
  trailing?: ReactNode
  accessory?: ReactNode
  start?: ReactNode
  tone?: Tone
  active: boolean
  activeSource?: ActiveSource
  selected?: boolean
  selectionAppearance?: SelectionAppearance
  open?: boolean
  dragging?: boolean
  disabled?: boolean
  highlightedClassName?: string
}

export const Row = forwardRef<HTMLDivElement, RowProps>((props, ref) => {
  const {
    label,
    leading,
    suffix,
    trailing,
    accessory,
    start,
    tone,
    active,
    activeSource,
    selected,
    selectionAppearance,
    open,
    dragging,
    disabled,
    highlightedClassName,
    className,
    ...domProps
  } = props

  return (
    <div
      ref={ref}
      className={cn(
        'flex h-8 w-full max-w-full cursor-pointer items-center gap-1 rounded-lg px-1.5 text-left text-sm font-medium outline-none transition-[background-color,color,opacity] duration-150 focus:outline-none',
        resolveRowAppearance({
          active,
          activeSource: activeSource ?? null,
          selected,
          selectionAppearance: selectionAppearance ?? 'row',
          open,
          destructive: tone === 'destructive'
        }),
        disabled && 'pointer-events-none opacity-40',
        dragging && 'opacity-70',
        className,
        (active || open) && highlightedClassName
      )}
      aria-disabled={disabled || undefined}
      {...domProps}
    >
      {start !== undefined && start !== null ? start : null}

      <div className="flex min-w-0 flex-1 items-center gap-2.5 self-stretch">
        <Content
          label={label}
          leading={leading}
          suffix={suffix}
          trailing={trailing}
          tone={tone}
        />
      </div>

      {accessory !== undefined && accessory !== null ? (
        <div
          className="flex h-8 shrink-0 items-center justify-center"
          onKeyDownCapture={stopPropagation}
          onPointerDown={stopPropagation}
          onMouseDown={stopPropagation}
          onClick={stopPropagation}
          onKeyDown={stopPropagation}
        >
          {accessory}
        </div>
      ) : null}
    </div>
  )
})

Row.displayName = 'Row'

interface HandleProps {
  ariaLabel: string
  icon?: ReactNode
  onActive?: () => void
  attributes?: VerticalReorderHandleProps['attributes']
  listeners?: VerticalReorderHandleProps['listeners']
  setActivatorNodeRef?: VerticalReorderHandleProps['setActivatorNodeRef']
}

export const Handle = (props: HandleProps) => (
  <button
    type="button"
    className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-transparent text-muted-foreground outline-none focus:outline-none"
    aria-label={props.ariaLabel}
    {...props.attributes}
    {...props.listeners}
    ref={props.setActivatorNodeRef}
    style={{ touchAction: 'none' }}
    onMouseEnter={props.onActive}
    onPointerDown={event => {
      stopPropagation(event)
      props.listeners?.onPointerDown?.(event)
    }}
    onMouseDown={stopPropagation}
    onClick={stopPropagation}
    onKeyDownCapture={stopPropagation}
  >
    {props.icon ?? (
      <GripVertical className="size-4 cursor-grab text-muted-foreground" size={16} strokeWidth={1.8} />
    )}
  </button>
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
