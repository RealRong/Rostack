import type { ReactNode } from 'react'
import type { Field } from '@dataview/core/contracts'
import { cn } from '@shared/ui/utils'
import { FieldValueRenderer } from '@dataview/react/field/value/FieldValueRenderer'
import { getFieldValueSpec } from '@dataview/react/field/value/kinds'

export interface FieldValueContentProps {
  field?: Field
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
  onQuickToggle?: () => void
  density?: 'default' | 'compact'
  multiline?: boolean
}

const QuickToggleButton = (props: {
  checked: boolean
  onToggle: () => void
  className?: string
  density: NonNullable<FieldValueContentProps['density']>
}) => (
  <button
    type="button"
    aria-pressed={props.checked}
    onPointerDown={event => {
      event.preventDefault()
      event.stopPropagation()
    }}
    onClick={event => {
      event.preventDefault()
      event.stopPropagation()
      props.onToggle()
    }}
    className={cn(
      'inline-flex items-center justify-center rounded-full text-[11px] font-medium transition-colors',
      props.density === 'compact'
        ? 'h-5 min-w-[4.75rem] px-2'
        : 'px-2 py-0.5',
      props.checked
        ? 'bg-green text-green'
        : 'bg-gray-muted text-gray hover:bg-gray',
      props.className
    )}
  >
    {props.checked ? 'Checked' : 'Unchecked'}
  </button>
)

export const FieldValueContent = (props: FieldValueContentProps) => {
  const spec = getFieldValueSpec(props.field)
  if (props.onQuickToggle && spec.capability.quickToggle && spec.toggle) {
    return (
      <QuickToggleButton
        checked={props.value === true}
        onToggle={props.onQuickToggle}
        className={props.className}
        density={props.density ?? 'default'}
      />
    )
  }

  return (
    <FieldValueRenderer
      field={props.field}
      value={props.value}
      emptyPlaceholder={props.emptyPlaceholder}
      className={props.className}
      multiline={props.multiline}
    />
  )
}
