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
    && previous.derivedIds === input.query.derived
    && previous.orderedIds === input.query.ordered
    && previous.visibleIds === input.query.visible
    ? previous
    : {
        viewId: input.activeViewId,
        derivedIds: input.query.derived,
        orderedIds: input.query.ordered,
        visibleIds: input.query.visible
      }
}
