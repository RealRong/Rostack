import type {
  View
} from '@dataview/core/contracts'
import type {
  ViewState
} from '@dataview/engine'

export type ActiveTypedViewState<TType extends View['type']> = ViewState & {
  view: View & {
    type: TType
  }
}

export const readActiveTypedViewState = <TType extends View['type']>(
  state: ViewState | undefined,
  type: TType
): ActiveTypedViewState<TType> | undefined => (
  state?.view.type === type
    ? state as ActiveTypedViewState<TType>
    : undefined
)
