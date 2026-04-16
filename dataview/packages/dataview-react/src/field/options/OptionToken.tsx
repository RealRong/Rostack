import {
  FieldOptionTag,
  type FieldOptionTagProps
} from '@dataview/react/field/options/FieldOptionTag'

export type OptionTokenProps = FieldOptionTagProps

export const OptionToken = (props: OptionTokenProps) => (
  <FieldOptionTag {...props} />
)
