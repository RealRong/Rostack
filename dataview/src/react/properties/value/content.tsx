import type { ReactNode } from 'react'
import type { GroupProperty } from '@dataview/core/contracts'
import { cn, uiTone } from '@dataview/react/ui'
import { PropertyValueRenderer } from './PropertyValueRenderer'
import { getPropertyValueSpec } from './kinds'

export interface PropertyValueContentProps {
  property?: GroupProperty
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
  onQuickToggle?: () => void
  density?: 'default' | 'compact'
}

const QuickToggleButton = (props: {
  checked: boolean
  onToggle: () => void
  className?: string
  density: NonNullable<PropertyValueContentProps['density']>
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
      uiTone.checkbox(props.checked),
      props.className
    )}
  >
    {props.checked ? 'Checked' : 'Unchecked'}
  </button>
)

export const PropertyValueContent = (props: PropertyValueContentProps) => {
  const spec = getPropertyValueSpec(props.property)
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
    <PropertyValueRenderer
      property={props.property}
      value={props.value}
      emptyPlaceholder={props.emptyPlaceholder}
      className={props.className}
    />
  )
}
