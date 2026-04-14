import type { Field } from '@dataview/core/contracts'
import { FieldValueContent } from '@dataview/react/field/value'

export interface CellValueProps {
  field: Field
  value: unknown
  canQuickToggle: boolean
  onQuickToggle: () => void
}

export const CellValue = (props: CellValueProps) => {
  return (
    <FieldValueContent
      field={props.field}
      value={props.value}
      onQuickToggle={props.canQuickToggle
        ? props.onQuickToggle
        : undefined}
      density="compact"
    />
  )
}
