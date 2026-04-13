import type { RenderProps } from '#react/field/value/kinds/contracts.ts'

export const renderEmpty = (props: RenderProps) => (
  props.emptyPlaceholder
    ? <>{props.emptyPlaceholder}</>
    : null
)
