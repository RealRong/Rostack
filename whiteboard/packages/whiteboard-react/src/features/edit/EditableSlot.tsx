import type {
  CSSProperties,
  RefCallback
} from 'react'
import { TextSlot } from '@whiteboard/react/features/edit/TextSlot'
import type { EditCaret } from '@whiteboard/editor'

export type EditableSlotProps = {
  value: string
  caret: EditCaret
  multiline: boolean
  className?: string
  style?: CSSProperties
  bindRef?: RefCallback<HTMLDivElement | null>
}

export const EditableSlot = ({
  value,
  caret,
  multiline,
  className,
  style,
  bindRef
}: EditableSlotProps) => (
  <TextSlot
    value={value}
    caret={caret}
    editable
    multiline={multiline}
    className={className}
    style={style}
    bindRef={bindRef}
  />
)
