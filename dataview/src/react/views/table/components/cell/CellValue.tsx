import type { GroupProperty } from '@/core/contracts'
import { PropertyValueContent } from '@/react/properties/value'

export interface CellValueProps {
  property: GroupProperty
  value: unknown
  canQuickToggle: boolean
  onQuickToggle: () => void
}

export const CellValue = (props: CellValueProps) => {
  return (
    <PropertyValueContent
      property={props.property}
      value={props.value}
      onQuickToggle={props.canQuickToggle
        ? props.onQuickToggle
        : undefined}
      density="compact"
    />
  )
}
