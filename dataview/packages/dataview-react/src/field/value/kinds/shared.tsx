import type { RenderProps } from '#dataview-react/field/value/kinds/contracts'

export const renderEmpty = (props: RenderProps) => (
  props.emptyPlaceholder
    ? <>{props.emptyPlaceholder}</>
    : null
)
