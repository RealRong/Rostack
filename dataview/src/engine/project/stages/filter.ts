import {
  resolveViewFilterProjection
} from '@dataview/core/filter'
import type {
  FilterView
} from '../types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

export const filterStage: Stage<FilterView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    return input.next.activeViewId
      ? resolveViewFilterProjection(input.next.document, input.next.activeViewId)
      : undefined
  }
}
