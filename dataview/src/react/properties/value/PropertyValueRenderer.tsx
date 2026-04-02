import type { ReactNode } from 'react'
import type { GroupProperty } from '@/core/contracts'
import { getPropertyValueSpec } from './kinds'

export interface PropertyValueRendererProps {
  property?: GroupProperty
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
}

export const PropertyValueRenderer = (props: PropertyValueRendererProps) => (
  <>{getPropertyValueSpec(props.property).render({
    value: props.value,
    emptyPlaceholder: props.emptyPlaceholder,
    className: props.className
  })}</>
)
