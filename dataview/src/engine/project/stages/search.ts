import type {
  ViewSearchProjection
} from '@dataview/core/search'
import type {
  SearchView
} from '../../types'
import type {
  Stage
} from '../runtime/stage'
import {
  reuse,
  shouldRun
} from '../runtime/stage'

const createSearchProjection = (
  viewId: string,
  search: ViewSearchProjection['search']
): ViewSearchProjection => ({
  viewId,
  search,
  query: search.query,
  ...(search.fields?.length
    ? { fields: [...search.fields] }
    : {}),
  active: Boolean(search.query.trim())
})

export const searchStage: Stage<SearchView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    const view = input.next.read.view()
    return view && input.next.activeViewId
      ? createSearchProjection(input.next.activeViewId, view.search)
      : undefined
  }
}
