import {
  resolveViewSortProjection
} from '@dataview/core/sort'
import type {
  SortView
} from '../types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

export const sortStage: Stage<SortView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    return input.next.activeViewId
      ? resolveViewSortProjection(input.next.document, input.next.activeViewId)
      : undefined
  }
}
