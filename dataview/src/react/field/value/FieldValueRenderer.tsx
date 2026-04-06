import type { ReactNode } from 'react'
import type { Field } from '@dataview/core/contracts'
import { getFieldValueSpec } from './kinds'

export interface FieldValueRendererProps {
  property?: Field
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
}

export const FieldValueRenderer = (props: FieldValueRendererProps) => (
  <>{getFieldValueSpec(props.property).render({
    value: props.value,
    emptyPlaceholder: props.emptyPlaceholder,
    className: props.className
  })}</>
)
