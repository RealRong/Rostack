import {
  resolveViewSearchProjection
} from '@dataview/core/search'
import type {
  SearchView
} from '../types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

export const searchStage: Stage<SearchView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    return input.next.activeViewId
      ? resolveViewSearchProjection(input.next.document, input.next.activeViewId)
      : undefined
  }
}
