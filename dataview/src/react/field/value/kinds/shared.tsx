import type { RenderProps } from './contracts'

export const renderEmpty = (props: RenderProps) => (
  props.emptyPlaceholder
    ? <>{props.emptyPlaceholder}</>
    : null
)
