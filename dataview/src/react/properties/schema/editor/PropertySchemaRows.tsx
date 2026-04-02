import { Check, ChevronRight } from 'lucide-react'
import { forwardRef, useState, type ReactNode } from 'react'
import {
  meta,
  renderMessage,
  type MessageSpec
} from '@dataview/meta'
import {
  Button,
  Menu,
  Popover,
  Switch
} from '@dataview/react/ui'

export const PropertyMenuRow = forwardRef<HTMLButtonElement, {
  label: string
  suffix?: string
  pressed?: boolean
  onClick: () => void
}>((props, ref) => (
  <Button
    ref={ref}
    onClick={props.onClick}
    layout="row"
    suffix={props.suffix}
    pressed={props.pressed}
    trailing={<ChevronRight className="size-4" size={16} strokeWidth={1.8} />}
  >
    {props.label}
  </Button>
))

PropertyMenuRow.displayName = 'PropertyMenuRow'

export const PropertyToggleRow = (props: {
  label: string
  checked: boolean
  onToggle: () => void
}) => (
  <Button
    onClick={props.onToggle}
    layout="row"
    trailing={props.checked
      ? <Check className="size-4 text-foreground" size={16} strokeWidth={1.8} />
      : undefined}
    pressed={props.checked}
  >
    {props.label}
  </Button>
)

export const PropertySwitchRow = (props: {
  label: string
  checked: boolean
  onToggle: () => void
}) => (
  <Button
    onClick={props.onToggle}
    layout="row"
    trailing={(
      <Switch
        checked={props.checked}
        onCheckedChange={() => undefined}
        interactive={false}
      />
    )}
  >
    {props.label}
  </Button>
)

export const PropertyChoiceList = <TValue extends string>(props: {
  value: TValue
  options: readonly {
    id: TValue
    message: MessageSpec
  }[]
  onSelect: (value: TValue) => void
}) => {
  return (
    <Menu
      items={props.options.map(option => ({
        kind: 'toggle' as const,
        key: option.id,
        label: renderMessage(option.message),
        checked: props.value === option.id,
        onSelect: () => props.onSelect(option.id)
      }))}
    />
  )
}

export const PropertyPopoverRow = (props: {
  label: string
  suffix?: string
  widthClassName: string
  children: (close: () => void) => ReactNode
}) => {
  const [open, setOpen] = useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={setOpen}
      initialFocus={-1}
      surface="scoped"
      trigger={(
        <PropertyMenuRow
          label={props.label}
          suffix={props.suffix}
          pressed={open}
          onClick={() => undefined}
        />
      )}
      contentClassName={`${props.widthClassName} p-1.5`}
    >
      <div className="flex flex-col">
        {props.children(() => setOpen(false))}
      </div>
    </Popover>
  )
}
