import type {
  ViewRecords
} from '../../contracts/public'
import type {
  QueryState
} from '../../contracts/internal'

export const publishViewRecords = (input: {
  query: QueryState
  previous?: ViewRecords
}): ViewRecords => {
  const previous = input.previous
  return previous
    && previous.matched === input.query.matched
    && previous.ordered === input.query.ordered
    && previous.visible === input.query.visible
    ? previous
    : {
        matched: input.query.matched,
        ordered: input.query.ordered,
        visible: input.query.visible
      }
}
