import {
  resolveViewGroupProjection
} from '@dataview/core/group'
import type {
  GroupView
} from '../types'
import type {
  Stage
} from './stage'
import {
  reuse,
  shouldRun
} from './stage'

export const groupStage: Stage<GroupView> = {
  run: input => {
    if (!shouldRun(input.action)) {
      return reuse(input)
    }

    return input.next.activeViewId
      ? resolveViewGroupProjection(input.next.document, input.next.activeViewId)
      : undefined
  }
}
