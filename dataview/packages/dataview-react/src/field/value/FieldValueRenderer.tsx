import type { ReactNode } from 'react'
import type { Field } from '@dataview/core/contracts'
import { getFieldValueSpec } from '@dataview/react/field/value/kinds'

export interface FieldValueRendererProps {
  field?: Field
  value: unknown
  emptyPlaceholder?: ReactNode
  className?: string
  multiline?: boolean
}

export const FieldValueRenderer = (props: FieldValueRendererProps) => (
  <>{getFieldValueSpec(props.field).render({
    value: props.value,
    emptyPlaceholder: props.emptyPlaceholder,
    className: props.className,
    multiline: props.multiline
  })}</>
)
