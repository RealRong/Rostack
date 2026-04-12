import type {
  ViewId
} from '@dataview/core/contracts'
import type {
  RecordSet
} from '../../api/public'
import type {
  QueryState
} from '../runtime/state'

export const publishRecordSet = (input: {
  activeViewId: ViewId
  query: QueryState
  previous?: RecordSet
}): RecordSet => {
  const previous = input.previous
  return previous
    && previous.viewId === input.activeViewId
    && previous.derived === input.query.derived
    && previous.ordered === input.query.ordered
    && previous.visible === input.query.visible
    ? previous
    : {
        viewId: input.activeViewId,
        derived: input.query.derived,
        ordered: input.query.ordered,
        visible: input.query.visible
      }
}
