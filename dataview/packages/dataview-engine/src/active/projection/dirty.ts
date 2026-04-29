import type {
  ViewPlan
} from '@dataview/engine/active/plan'
import type {
  FieldId
} from '@dataview/core/types'

const EMPTY_FIELDS = [] as const

export const sectionChanged = (input: {
  previousPlan?: ViewPlan
  plan?: ViewPlan
}): boolean => {
  const previous = input.previousPlan?.section
  const next = input.plan?.section
  if (!previous || !next) {
    return previous !== next
  }

  return previous.fieldId !== next.fieldId
    || previous.mode !== next.mode
    || previous.sort !== next.sort
    || previous.interval !== next.interval
    || previous.showEmpty !== next.showEmpty
}

export const calculationFieldsChanged = (input: {
  previousPlan?: ViewPlan
  plan?: ViewPlan
}): boolean => {
  const previous = input.previousPlan?.calcFields ?? EMPTY_FIELDS
  const next = input.plan?.calcFields ?? EMPTY_FIELDS
  if (previous.length !== next.length) {
    return true
  }

  return previous.some((fieldId: FieldId, index) => fieldId !== next[index])
}
